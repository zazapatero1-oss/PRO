// chat-turn handler (SPEC §7 with the v1.1 §C talk/extract split). All dependencies are
// injected so the whole turn can be exercised in unit tests with fakes; index.ts only wires
// real clients.
//
// One patient turn, in order: deterministic safety + control phrases → the conversational call
// (no tools, streamed) running concurrently with the model safety screen → the extraction call
// (one JSON completion) → persist → tracker → `status` (and `ended` when the tracker says so).

import type Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicClientLike,
  ChatTurnRequest,
  Db,
  EndReason,
  ExtractionResult,
  Language,
  MessageRow,
  SafetyTrigger,
  SessionRow,
  SseEvent,
  TrackerState,
} from "../_shared/types.ts";
import { badRequest, conflict, errorResponse } from "../_shared/errors.ts";
import { requireSessionToken } from "../_shared/auth.ts";
import { AsyncQueue, sseResponse } from "../_shared/sse.ts";
import { detectSafety } from "../_shared/safety.ts";
import { PAUSE_MESSAGES, safetyMessageFor, STOP_MESSAGES } from "../_shared/safety_messages.ts";
import { detectControlPhrase } from "../_shared/control.ts";
import { isConfirmation, prioritisedOpen } from "../_shared/tracker.ts";
import {
  budgetFraction,
  buildExtractionPrompt,
  buildSystemPromptBlocks,
  renderPriorBrief,
  type TurnBudget,
} from "../_shared/prompt.ts";
import {
  cachedSystem,
  completeJson,
  type CompleteJsonResult,
  isRetryableAnthropicError,
  streamTurn,
} from "../_shared/anthropic.ts";
import { renderScreenForPrompt } from "../_shared/screen.ts";
import { classifySafety } from "../_shared/safety_classifier.ts";
import { persistExtraction, validateExtraction } from "../_shared/extraction.ts";
import {
  DEFAULT_EXTRACT_MODEL,
  estimateCostUsd,
  EXTRACT_MAX_OUTPUT_TOKENS,
  TALK_MAX_OUTPUT_TOKENS,
} from "../_shared/config.ts";
import { writeAudit } from "../_shared/db.ts";
import {
  countAssistantTurns,
  diagnosisLabel,
  loadSessionContext,
  nextSeq,
  priorCompletedProfile,
  type SessionContext,
  trackerStateFor,
} from "../_shared/session_context.ts";

export interface ChatTurnDeps {
  db: Db;
  anthropic: AnthropicClientLike;
  model: string;
  /** Model for the second safety layer; undefined disables it (tests, SAFETY_MODEL=off). */
  safetyModel?: string;
  /** Model for the per-turn extraction call (v1.1 §C). */
  extractModel?: string;
  origin?: string;
  now?: () => Date;
}

const SESSION_START_USER_MESSAGE =
  "[The session has just started. Greet the patient and open the conversation.]";

function validateBody(raw: unknown): ChatTurnRequest {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (typeof b.session_id !== "string" || !b.session_id) throw badRequest("session_id is required");
  if (typeof b.resume_token !== "string" || !b.resume_token) {
    throw badRequest("resume_token is required");
  }
  if (b.text !== null && b.text !== undefined && typeof b.text !== "string") {
    throw badRequest("text must be a string or null");
  }
  const text = typeof b.text === "string" ? b.text.trim() : null;
  if (text !== null && text.length === 0) throw badRequest("text must not be empty");
  if (text !== null && text.length > 4000) throw badRequest("text is too long (max 4000 chars)");
  const mode = b.input_mode === "voice" ? "voice" : b.input_mode === "text" ? "text" : null;
  return { session_id: b.session_id, resume_token: b.resume_token, text, input_mode: mode };
}

export async function handleChatTurn(deps: ChatTurnDeps, raw: unknown): Promise<Response> {
  const origin = deps.origin ?? "*";
  let body: ChatTurnRequest;
  let session: SessionRow;
  let ctx: SessionContext;
  try {
    body = validateBody(raw);
    session = await requireSessionToken(deps.db, body);
    switch (session.status) {
      case "safety-halted":
        throw conflict(
          "This conversation is paused until the care team reopens it.",
          "safety_halted",
        );
      case "intake":
        throw conflict(
          "Consent is required before the conversation can start.",
          "consent_required",
        );
      case "wrapping-up":
      case "summary-review":
      case "completed":
      case "abandoned":
        throw conflict("This conversation has ended.", "session_closed");
    }
    ctx = await loadSessionContext(deps.db, session);
    if (body.text === null && countAssistantTurns(ctx.messages) > 0) {
      throw badRequest("The opening message was already sent.", "opening_already_sent");
    }
  } catch (err) {
    return errorResponse(err, origin);
  }
  return sseResponse(runTurn(deps, body, ctx), origin);
}

async function* runTurn(
  deps: ChatTurnDeps,
  body: ChatTurnRequest,
  ctx: SessionContext,
): AsyncGenerator<SseEvent> {
  const now = deps.now ?? (() => new Date());
  const { db } = deps;
  let session = ctx.session;
  const language: Language = session.language;
  const startedAt = now();

  if (session.status === "consented") {
    session = await db.updateSession(session.id, {
      status: "active",
      started_at: session.started_at ?? startedAt.toISOString(),
    });
  }

  // The message the patient is answering: what a confirmation ("yes, that's right") refers to.
  const priorAssistant = [...ctx.messages].reverse().find((m) => m.role === "assistant") ?? null;

  // ---- patient message, deterministic safety patterns, control phrases (before any call) ----
  let patientMessage: MessageRow | null = null;
  const turnNotes: string[] = [];
  if (body.text !== null) {
    patientMessage = await insertPatientMessageIdempotent(db, ctx, body);

    const keywordHit = detectSafety(body.text, language);
    if (keywordHit) {
      yield* haltForSafety(deps, ctx, session, patientMessage.id, {
        trigger: keywordHit.trigger,
        detected_by: "keyword",
        detail: `matched "${keywordHit.matched}"`,
      });
      return;
    }

    const control = detectControlPhrase(body.text, language);
    if (control?.kind === "stop") {
      const text = STOP_MESSAGES[language] ?? STOP_MESSAGES.en;
      await insertAssistantMessage(db, ctx, text, null);
      await db.updateSession(session.id, { status: "wrapping-up", phase: "wrap-up" });
      await writeAudit(db, {
        actor_type: "participant",
        actor_id: session.id,
        action: "session.stop_requested",
        target_type: "session",
        target_id: session.id,
      });
      yield { event: "token", data: { t: text } };
      yield { event: "ended", data: { reason: "patient_requested" } };
      return;
    }
    if (control?.kind === "pause") {
      const text = PAUSE_MESSAGES[language] ?? PAUSE_MESSAGES.en;
      await insertAssistantMessage(db, ctx, text, null);
      yield { event: "token", data: { t: text } };
      yield statusEvent(trackerStateFor(ctx, session, 0), ctx, session);
      return;
    }
    if (control?.kind === "skip" || control?.kind === "rather_not") {
      const pre = trackerStateFor(ctx, session, 0);
      const current = pre.current_focus?.construct_id ??
        prioritisedOpen(ctx.coverage)[0]?.construct_id;
      if (current) {
        const row = await db.insertEvidence({
          session_id: session.id,
          construct_id: current,
          message_id: patientMessage.id,
          patient_quote: body.text,
          quote_gloss_en: body.text,
          severity: "declined",
          confidence: 1,
          interference: [],
          facets: [],
          triage_item: null,
          note: `declined via control phrase (${control.kind})`,
          superseded_by: null,
        });
        ctx.evidence.push(row);
        turnNotes.push(
          `The patient declined the current topic (${current}); it is already recorded as declined. Acknowledge briefly without apology overload and move to the next topic.`,
        );
      } else {
        turnNotes.push("The patient declined the current topic. Acknowledge briefly and move on.");
      }
    }
  }

  // ---- budget + tracker state for this turn ----
  const turnsUsed = countAssistantTurns(ctx.messages);
  const started = session.started_at ? new Date(session.started_at) : startedAt;
  const budget: TurnBudget = {
    turnsUsed,
    maxTurns: session.max_turns,
    minutesElapsed: Math.max(0, (now().getTime() - started.getTime()) / 60000),
    targetMinutes: session.target_minutes,
  };
  const tracker = trackerStateFor(ctx, session, budgetFraction(budget));
  if (tracker.end_reason) {
    turnNotes.push(
      "This is the final message of the session: thank the patient, close warmly in one or two sentences, and do not ask anything new.",
    );
  }

  // ---- prompt ----
  let priorBrief: string | null = null;
  if (session.timepoint !== "baseline") {
    const prior = await priorCompletedProfile(db, session);
    if (prior) priorBrief = renderPriorBrief(prior.profile, prior.session.timepoint);
  }
  const note = ctx.notes.length
    ? {
      note: ctx.notes.map((n) => n.note).filter(Boolean).join("\n"),
      focus_constructs: [...new Set(ctx.notes.flatMap((n) => n.focus_constructs ?? []))],
    }
    : null;
  const { stable, dynamic } = buildSystemPromptBlocks({
    language,
    ageBand: ctx.participant.age_band,
    readingComfort: ctx.participant.reading_comfort,
    respondent: session.respondent,
    displayName: ctx.participant.display_name,
    diagnosisLabel: diagnosisLabel(ctx.diagnosis, ctx.participant, language),
    timepoint: session.timepoint,
    priorBrief,
    screenBrief: session.screen_scores
      ? renderScreenForPrompt(
        await db.listScreenItems(ctx.mapRow.population),
        session.screen_scores,
        language,
      )
      : null,
    clinicianNote: note,
    population: ctx.mapRow.population,
    activeConstructs: ctx.activeConstructs,
    tracker,
    budget,
    turnNotes,
  });
  const history = toApiMessages(ctx.messages);

  // ---- conversational call (no tools) and safety screen, started together (§C step 2) ----
  const t0 = Date.now();
  const safetyScreen = body.text !== null && deps.safetyModel
    ? classifySafety({
      client: deps.anthropic,
      model: deps.safetyModel,
      text: body.text,
      recent: ctx.messages.map((m) => ({ role: m.role, content: m.content })),
    })
    : Promise.resolve(null);

  const queue = new AsyncQueue<SseEvent>();
  const run = streamTurn({
    client: deps.anthropic,
    model: deps.model,
    system: cachedSystem(stable, dynamic),
    messages: history,
    tools: [],
    maxTokens: TALK_MAX_OUTPUT_TOKENS,
    onText: (delta) => queue.push({ event: "token", data: { t: delta } }),
  })
    .then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    .finally(() => queue.close());

  // Extraction only needs the patient's message and the previous question, so it runs
  // concurrently with the reply instead of after it (§C step 4). Failure must not break the turn.
  const extractionRun: Promise<CompleteJsonResult<ExtractionResult> | null> =
    patientMessage && body.text !== null
      ? (() => {
        const text = body.text;
        const { system, user } = buildExtractionPrompt({
          lastAssistantMessage: priorAssistant?.content ?? null,
          patientMessage: text,
          activeConstructs: ctx.activeConstructs,
          population: ctx.mapRow.population,
          triage: tracker.triage.items,
          language,
          // In explore, only the focus areas need detail tags; triage tags everything.
          facetsFor: tracker.phase === "explore" ? new Set(session.focus_constructs) : null,
        });
        return completeJson<ExtractionResult>({
          client: deps.anthropic,
          model: deps.extractModel ?? DEFAULT_EXTRACT_MODEL,
          system,
          user,
          maxTokens: EXTRACT_MAX_OUTPUT_TOKENS,
          validate: (v) => validateExtraction(v, ctx.activeConstructs, tracker.triage.items, text),
        }).catch((err: unknown) => {
          console.error("chat-turn extraction failed; the turn continues", err);
          return null;
        });
      })()
      : Promise.resolve(null);

  for await (const ev of queue) yield ev;
  const outcome = await run;
  if (!outcome.ok) {
    console.error("chat-turn model call failed", outcome.error);
    await safetyScreen.catch(() => null);
    yield {
      event: "error",
      data: {
        retryable: isRetryableAnthropicError(outcome.error),
        message: "One moment… the assistant could not reply. Please try again.",
        ...(Deno.env.get("DEBUG_ERRORS") === "1" ? { detail: String(outcome.error) } : {}),
      },
    };
    return;
  }
  const { result } = outcome;
  const latency = Date.now() - t0;
  if (Deno.env.get("DEBUG_ERRORS") === "1") {
    yield {
      event: "debug",
      data: {
        stop: result.stopReason,
        rounds: result.rounds,
        text_len: result.text.length,
        usage: result.usage,
        system_len: stable.length + dynamic.length,
        history_roles: history.map((m) => m.role),
      },
    };
  }

  // ---- persist the reply ----
  if (result.text.trim()) {
    await insertAssistantMessage(db, ctx, result.text.trim(), {
      tokens_in: result.usage.input_tokens,
      tokens_out: result.usage.output_tokens,
      latency_ms: latency,
    });
  }
  let inputTokens = session.input_tokens + result.usage.input_tokens;
  let outputTokens = session.output_tokens + result.usage.output_tokens;

  // ---- §C step 3: the safety screen result lands after the reply, and still halts ----
  const screened = await safetyScreen.catch(() => null);
  if (screened && patientMessage) {
    await db.updateSession(session.id, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd_estimate: estimateCostUsd(deps.model, inputTokens, outputTokens),
    });
    yield* haltForSafety(deps, ctx, session, patientMessage.id, {
      trigger: screened.trigger,
      detected_by: "model",
      detail: screened.rationale,
    });
    return;
  }

  // ---- §C step 4: extraction result (started alongside the reply). ----
  const extraction = await extractionRun;
  if (extraction && patientMessage && body.text !== null) {
    try {
      inputTokens += extraction.usage.input_tokens;
      outputTokens += extraction.usage.output_tokens;
      const events = await persistExtraction({
        db,
        sessionId: session.id,
        messageId: patientMessage.id,
        patientMessage: body.text,
        lastAssistantMessage: priorAssistant?.content ?? null,
        result: extraction.value,
        alreadyConfirmed: new Set(
          ctx.findings.filter(isConfirmation).map((f) => f.construct_id),
        ),
        defaultConstructId: tracker.current_focus?.construct_id ??
          ctx.activeConstructs[0]?.id ?? null,
      });
      for (const e of events) yield { event: "evidence", data: e };
    } catch (err) {
      console.error("chat-turn extraction persist failed; the turn continues", err);
    }
  }

  // ---- recompute the tracker from what is now stored ----
  ctx.evidence = await db.listEvidence(session.id);
  ctx.findings = await db.listFindings(session.id);
  const after = trackerStateFor(ctx, session, budgetFraction(budget));

  const sessionPatch: Partial<SessionRow> = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd_estimate: estimateCostUsd(deps.model, inputTokens, outputTokens),
    phase: after.phase,
    focus_constructs: after.focus_constructs,
  };

  // The end decision was made before the model wrote, so this reply is already the goodbye.
  const endReason: EndReason | null = tracker.end_reason;
  if (endReason) {
    await db.updateSession(session.id, { ...sessionPatch, status: "wrapping-up" });
    yield statusEvent(after, ctx, session);
    yield { event: "ended", data: { reason: endReason } };
    return;
  }

  await db.updateSession(session.id, sessionPatch);
  yield statusEvent(after, ctx, session);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function statusEvent(
  tracker: TrackerState,
  ctx: SessionContext,
  session: SessionRow,
): SseEvent {
  return {
    event: "status",
    data: {
      coverage: {
        covered: tracker.coverage.covered,
        total_active: tracker.coverage.total_active,
      },
      phase: tracker.phase,
      current_focus: tracker.current_focus?.construct_id ?? null,
      focus_progress: tracker.focus_progress,
      turns_used: countAssistantTurns(ctx.messages),
      max_turns: session.max_turns,
    },
  };
}

/** Both safety layers end the same way: flag, fixed message, halted session, `safety` event. */
async function* haltForSafety(
  deps: ChatTurnDeps,
  ctx: SessionContext,
  session: SessionRow,
  messageId: string,
  safety: { trigger: SafetyTrigger; detected_by: "keyword" | "model"; detail: string },
): AsyncGenerator<SseEvent> {
  const { db } = deps;
  const language = session.language;
  const message = safetyMessageFor(language, ctx.participant.age_band);
  await db.insertSafetyFlag({
    session_id: session.id,
    message_id: messageId,
    trigger: safety.trigger,
    detected_by: safety.detected_by,
    action_taken: `session halted; fixed ${language} message shown; ${safety.detail}`,
    reviewed_by: null,
    reviewed_at: null,
  });
  await db.updateSession(session.id, { status: "safety-halted" });
  await insertAssistantMessage(db, ctx, message, null);
  await writeAudit(db, {
    actor_type: "system",
    actor_id: "safety",
    action: "session.safety_halt",
    target_type: "session",
    target_id: session.id,
    metadata: { trigger: safety.trigger, detected_by: safety.detected_by },
  });
  yield { event: "safety", data: { message } };
}

/** A retried turn re-sends the same text; reuse the dangling patient message instead of duplicating. */
async function insertPatientMessageIdempotent(
  db: Db,
  ctx: SessionContext,
  body: ChatTurnRequest,
): Promise<MessageRow> {
  const last = ctx.messages[ctx.messages.length - 1];
  if (last && last.role === "patient" && last.content === body.text) return last;
  const row = await db.insertMessage({
    session_id: ctx.session.id,
    seq: nextSeq(ctx.messages),
    role: "patient",
    content: body.text ?? "",
    input_mode: body.input_mode,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  ctx.messages.push(row);
  return row;
}

async function insertAssistantMessage(
  db: Db,
  ctx: SessionContext,
  content: string,
  usage: { tokens_in: number; tokens_out: number; latency_ms: number } | null,
): Promise<MessageRow> {
  const row = await db.insertMessage({
    session_id: ctx.session.id,
    seq: nextSeq(ctx.messages),
    role: "assistant",
    content,
    input_mode: null,
    tokens_in: usage?.tokens_in ?? null,
    tokens_out: usage?.tokens_out ?? null,
    latency_ms: usage?.latency_ms ?? null,
  });
  ctx.messages.push(row);
  return row;
}

/** Patient → user, assistant → assistant; system events are server-side only. */
export function toApiMessages(messages: MessageRow[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [{ role: "user", content: SESSION_START_USER_MESSAGE }];
  for (const m of messages) {
    if (m.role === "patient") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") out.push({ role: "assistant", content: m.content });
  }
  return out;
}
