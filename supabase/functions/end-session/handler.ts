// end-session: generate the profile (§8) and the patient summary, move to summary-review.

import type {
  AnthropicClientLike,
  AuthClient,
  Db,
  EndSessionRequest,
  EndSessionResponse,
  ProfileJson,
  SessionRow,
} from "../_shared/types.ts";
import { badRequest, conflict, jsonResponse, notFound } from "../_shared/errors.ts";
import { requireClinician, requireSessionToken } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";
import { estimateCostUsd, MAX_JSON_OUTPUT_TOKENS } from "../_shared/config.ts";
import { extractText, NO_THINKING } from "../_shared/anthropic.ts";
import { buildPatientSummaryPrompt } from "../_shared/prompt.ts";
import { fallbackPatientSummary, generateProfile } from "../_shared/profile.ts";
import {
  loadSessionContext,
  mapRef,
  priorCompletedProfile,
  type SessionContext,
} from "../_shared/session_context.ts";

export interface EndSessionDeps {
  db: Db;
  auth: AuthClient;
  anthropic: AnthropicClientLike;
  model: string;
  promptVersion: string;
  origin?: string;
  now?: () => Date;
}

/** Shared with confirm-summary (regeneration after corrections). */
export async function generateAndStoreProfile(
  deps: Pick<EndSessionDeps, "db" | "anthropic" | "model" | "promptVersion" | "now">,
  ctx: SessionContext,
  opts: { regeneratePatientSummary: boolean; existing?: { patient_summary: string } | null },
): Promise<{ profile: ProfileJson; patient_summary: string; session: SessionRow }> {
  const now = deps.now ?? (() => new Date());
  const { db } = deps;
  const prior = await priorCompletedProfile(db, ctx.session);
  const gen = await generateProfile(
    {
      activeConstructs: ctx.activeConstructs,
      coverage: ctx.coverage,
      evidence: ctx.evidence,
      findings: ctx.findings,
      language: ctx.session.language,
      timepoint: ctx.session.timepoint,
      priorProfile: prior?.profile ?? null,
      focusConstructs: ctx.session.focus_constructs ?? [],
      generatedWith: {
        model: deps.model,
        prompt_version: deps.promptVersion,
        map: mapRef(ctx.mapRow),
      },
    },
    { client: deps.anthropic, model: deps.model },
  );
  let usageIn = gen.usage.input_tokens;
  let usageOut = gen.usage.output_tokens;

  let patientSummary = opts.existing?.patient_summary ?? "";
  const heardAnything = gen.profile.domains.some((d) =>
    d.constructs.some((c) => c.quotes.length > 0)
  );
  if (!heardAnything) {
    // Nothing to reflect back; the model would only speculate.
    patientSummary = fallbackPatientSummary(gen.profile, ctx.session.language);
  } else if (opts.regeneratePatientSummary || !patientSummary) {
    const { system, user } = buildPatientSummaryPrompt({
      language: ctx.session.language,
      ageBand: ctx.participant.age_band,
      readingComfort: ctx.participant.reading_comfort,
      respondent: ctx.session.respondent,
      displayName: ctx.participant.display_name,
      profile: gen.profile,
    });
    try {
      const msg = await deps.anthropic.messages.create({
        ...NO_THINKING,
        model: deps.model,
        max_tokens: MAX_JSON_OUTPUT_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });
      usageIn += msg.usage.input_tokens;
      usageOut += msg.usage.output_tokens;
      patientSummary = extractText(msg).trim() ||
        fallbackPatientSummary(gen.profile, ctx.session.language);
    } catch (err) {
      console.error("patient summary generation failed; using fallback", err);
      patientSummary = fallbackPatientSummary(gen.profile, ctx.session.language);
    }
  }

  const existingProfile = await db.getProfile(ctx.session.id);
  await db.upsertProfile({
    session_id: ctx.session.id,
    profile: gen.profile,
    patient_summary: patientSummary,
    patient_summary_confirmed_at: existingProfile?.patient_summary_confirmed_at ?? null,
    patient_corrections: existingProfile?.patient_corrections ?? null,
    generated_at: now().toISOString(),
  });

  const inputTokens = ctx.session.input_tokens + usageIn;
  const outputTokens = ctx.session.output_tokens + usageOut;
  const session = await db.updateSession(ctx.session.id, {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd_estimate: estimateCostUsd(deps.model, inputTokens, outputTokens),
  });
  return { profile: gen.profile, patient_summary: patientSummary, session };
}

export async function handleEndSession(
  deps: EndSessionDeps,
  req: Request,
  raw: unknown,
): Promise<Response> {
  const origin = deps.origin ?? "*";
  const now = deps.now ?? (() => new Date());
  const body = (raw ?? {}) as EndSessionRequest;
  const { db } = deps;

  let session: SessionRow;
  let actor: { actor_type: "participant" | "clinician"; actor_id: string };
  if (typeof body.resume_token === "string" && body.resume_token) {
    session = await requireSessionToken(db, body);
    actor = { actor_type: "participant", actor_id: session.id };
  } else if (typeof body.session_id === "string" && body.session_id) {
    const clinician = await requireClinician(req, deps);
    const s = await db.getSession(body.session_id);
    if (!s) throw notFound("Session not found");
    session = s;
    actor = { actor_type: "clinician", actor_id: clinician.clinicianId };
  } else {
    throw badRequest("resume_token or session_id is required");
  }

  if (session.status === "summary-review" || session.status === "completed") {
    // Idempotent: return what exists.
    const existing = await db.getProfile(session.id);
    if (existing) {
      const res: EndSessionResponse = {
        status: "summary-review",
        patient_summary: existing.patient_summary,
      };
      return jsonResponse(res, 200, origin);
    }
  }
  if (session.status === "intake" || session.status === "consented") {
    throw conflict("The conversation has not started yet.", "invalid_status");
  }
  if (session.status === "safety-halted") {
    throw conflict("The session is halted; a clinician must reopen it first.", "safety_halted");
  }

  const ended = await db.updateSession(session.id, {
    ended_at: session.ended_at ?? now().toISOString(),
  });
  const ctx = await loadSessionContext(db, ended);
  const out = await generateAndStoreProfile(deps, ctx, { regeneratePatientSummary: true });
  await db.updateSession(session.id, { status: "summary-review" });
  await writeAudit(db, {
    ...actor,
    action: "session.end",
    target_type: "session",
    target_id: session.id,
    metadata: { covered: ctx.coverage.covered, total_active: ctx.coverage.total_active },
  });

  const res: EndSessionResponse = {
    status: "summary-review",
    patient_summary: out.patient_summary,
  };
  return jsonResponse(res, 200, origin);
}
