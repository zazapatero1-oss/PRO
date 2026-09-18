// confirm-summary: apply patient corrections as new evidence (superseding old rows), regenerate
// the profile when anything changed, and complete the session (SPEC §7.7).

import type {
  ActiveConstruct,
  AnthropicClientLike,
  ConfirmSummaryRequest,
  ConfirmSummaryResponse,
  Db,
  PatientCorrection,
  RecordEvidenceInput,
} from "../_shared/types.ts";
import { badRequest, conflict, jsonResponse } from "../_shared/errors.ts";
import { requireSessionToken } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";
import { MAX_JSON_OUTPUT_TOKENS } from "../_shared/config.ts";
import { completeJson } from "../_shared/anthropic.ts";
import { loadSessionContext, nextSeq } from "../_shared/session_context.ts";
import { renderConstruct } from "../_shared/prompt.ts";
import { validateEvidence } from "../chat-turn/tools.ts";
import { generateAndStoreProfile } from "../end-session/handler.ts";

export interface ConfirmSummaryDeps {
  db: Db;
  anthropic: AnthropicClientLike;
  model: string;
  promptVersion: string;
  origin?: string;
  now?: () => Date;
}

function validateBody(raw: unknown): ConfirmSummaryRequest {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (typeof b.resume_token !== "string" || !b.resume_token) {
    throw badRequest("resume_token is required");
  }
  if (b.confirmed !== true) throw badRequest("confirmed must be true");
  const list = Array.isArray(b.corrections) ? b.corrections : [];
  const corrections: PatientCorrection[] = [];
  for (const c of list) {
    const o = (c ?? {}) as Record<string, unknown>;
    if (typeof o.patient_text !== "string" || !o.patient_text.trim()) continue;
    corrections.push({
      construct_id: typeof o.construct_id === "string" && o.construct_id ? o.construct_id : null,
      patient_text: o.patient_text.trim().slice(0, 2000),
    });
  }
  if (corrections.length > 20) throw badRequest("Too many corrections (max 20)");
  return { resume_token: b.resume_token, corrections, confirmed: true };
}

/** One non-streaming call per correction; the model decides the construct(s) when none is given. */
export function buildCorrectionPrompt(input: {
  correction: PatientCorrection;
  active: ActiveConstruct[];
  population: "adult" | "pediatric";
  language: string;
  currentSummary: string;
}): { system: string; user: string } {
  const system = [
    "A patient is correcting an AI-assisted summary of a conversation about how they are doing. Re-extract evidence from their correction only.",
    'Rules: quote their exact words; rate severity with the construct\'s signals; if the correction says a topic does not apply or is fine, record severity "none"; if it cannot be rated, use "unclear". Only use construct ids from the list. When no construct_id is given, choose the construct(s) the correction clearly refers to; return an empty list if none applies.',
    'Output ONLY JSON: {"items": [{"construct_id": "...", "patient_quote": "...", "quote_gloss_en": "...", "severity": "none|mild|moderate|severe|unclear", "confidence": 0.0-1.0, "interference": ["social","work","school","sleep","relationships","daily-activities"], "note": "..."}]}',
  ].join("\n");
  const user = [
    `Conversation language: ${input.language}.`,
    "Summary the patient saw:",
    input.currentSummary,
    "",
    input.correction.construct_id
      ? `The correction is about construct: ${input.correction.construct_id}`
      : "The patient did not pick a construct; decide from the text.",
    `Patient correction (verbatim): "${input.correction.patient_text}"`,
    "",
    "Constructs:",
    ...input.active.map((c) => renderConstruct(c, input.population)),
  ].join("\n");
  return { system, user };
}

export async function handleConfirmSummary(
  deps: ConfirmSummaryDeps,
  raw: unknown,
): Promise<Response> {
  const origin = deps.origin ?? "*";
  const now = deps.now ?? (() => new Date());
  const body = validateBody(raw);
  const { db } = deps;
  const session = await requireSessionToken(db, body);
  if (session.status === "completed") {
    const res: ConfirmSummaryResponse = { status: "completed" };
    return jsonResponse(res, 200, origin);
  }
  if (session.status !== "summary-review") {
    throw conflict("The summary is not ready for confirmation yet.", "invalid_status");
  }
  const existing = await db.getProfile(session.id);
  if (!existing) throw conflict("No summary to confirm; call end-session first.", "no_profile");

  const ctx = await loadSessionContext(db, session);
  const extracted: RecordEvidenceInput[] = [];

  for (const correction of body.corrections) {
    if (
      correction.construct_id && !ctx.activeConstructs.some((c) => c.id === correction.construct_id)
    ) {
      correction.construct_id = null;
    }
    // The correction becomes a patient message so new evidence has provenance.
    const msg = await db.insertMessage({
      session_id: session.id,
      seq: nextSeq(ctx.messages),
      role: "patient",
      content: correction.patient_text,
      input_mode: "text",
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
    });
    ctx.messages.push(msg);

    const { system, user } = buildCorrectionPrompt({
      correction,
      active: ctx.activeConstructs,
      population: ctx.mapRow.population,
      language: session.language,
      currentSummary: existing.patient_summary,
    });
    let items: RecordEvidenceInput[] = [];
    try {
      const res = await completeJson<{ items: unknown[] }>({
        client: deps.anthropic,
        model: deps.model,
        system,
        user,
        maxTokens: MAX_JSON_OUTPUT_TOKENS,
        validate: (v) => {
          const o = (v ?? {}) as { items?: unknown };
          if (!Array.isArray(o.items)) throw new Error("items must be an array");
          return { items: o.items };
        },
      });
      for (const it of res.value.items) {
        try {
          const ev = validateEvidence(it, ctx.activeConstructs);
          if (correction.construct_id && ev.construct_id !== correction.construct_id) continue;
          items.push(ev);
        } catch (err) {
          console.warn("dropping invalid correction item", (err as Error).message);
        }
      }
    } catch (err) {
      console.error("correction re-extraction failed", err);
      items = [];
    }
    // If the model could not extract anything but the patient named a construct, keep the words.
    if (items.length === 0 && correction.construct_id) {
      items.push({
        construct_id: correction.construct_id,
        patient_quote: correction.patient_text,
        quote_gloss_en: correction.patient_text,
        severity: "unclear",
        confidence: 0.5,
        interference: [],
        note: "patient correction; severity could not be re-extracted",
      });
    }

    for (const ev of items) {
      const row = await db.insertEvidence({
        session_id: session.id,
        message_id: msg.id,
        superseded_by: null,
        ...ev,
        note: ev.note ?? "patient correction",
      });
      for (const old of ctx.evidence) {
        if (
          old.construct_id === ev.construct_id && old.superseded_by === null && old.id !== row.id
        ) {
          await db.updateEvidence(old.id, { superseded_by: row.id });
          old.superseded_by = row.id;
        }
      }
      ctx.evidence.push(row);
      extracted.push(ev);
    }
  }

  const appliedAt = now().toISOString();
  if (body.corrections.length > 0) {
    const fresh = await loadSessionContext(db, session);
    await generateAndStoreProfile(deps, fresh, {
      regeneratePatientSummary: false,
      existing: { patient_summary: existing.patient_summary },
    });
  }
  const current = await db.getProfile(session.id);
  await db.upsertProfile({
    session_id: session.id,
    profile: current?.profile ?? existing.profile,
    patient_summary: current?.patient_summary ?? existing.patient_summary,
    patient_summary_confirmed_at: appliedAt,
    patient_corrections: body.corrections.length
      ? { corrections: body.corrections, extracted, applied_at: appliedAt }
      : null,
    generated_at: current?.generated_at ?? existing.generated_at,
  });
  await db.updateSession(session.id, { status: "completed" });
  await writeAudit(db, {
    actor_type: "participant",
    actor_id: session.id,
    action: "session.confirm_summary",
    target_type: "session",
    target_id: session.id,
    metadata: { corrections: body.corrections.length, evidence_added: extracted.length },
  });
  const res: ConfirmSummaryResponse = { status: "completed" };
  return jsonResponse(res, 200, origin);
}
