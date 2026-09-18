// session-state: patient-side read/resume, consent, and intake updates (SPEC §7.7, §9).

import type {
  ConsentVariant,
  Db,
  SessionStateRequest,
  SessionStateResponse,
} from "../_shared/types.ts";
import { badRequest, conflict, jsonResponse } from "../_shared/errors.ts";
import { requireSessionToken } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";
import {
  consentVariantNeeded,
  countAssistantTurns,
  loadSessionContext,
  trackerStateFor,
} from "../_shared/session_context.ts";
import { validateParticipantInput } from "../start-session/handler.ts";

export interface SessionStateDeps {
  db: Db;
  origin?: string;
  now?: () => Date;
}

const CONSENT_VARIANTS: ConsentVariant[] = ["adult", "minor-assent", "guardian"];

export async function handleSessionState(deps: SessionStateDeps, raw: unknown): Promise<Response> {
  const origin = deps.origin ?? "*";
  const now = deps.now ?? (() => new Date());
  const body = (raw ?? {}) as SessionStateRequest;
  const { db } = deps;
  let session = await requireSessionToken(db, body);
  const participant0 = await db.getParticipant(session.participant_id);
  if (!participant0) throw badRequest("Participant not found");

  if (body.action === "consent") {
    if (session.status !== "intake" && session.status !== "consented") {
      throw conflict("Consent can only be given before the conversation starts.", "invalid_status");
    }
    const variant = body.consent_variant;
    if (!variant || !CONSENT_VARIANTS.includes(variant)) {
      throw badRequest(`consent_variant must be one of ${CONSENT_VARIANTS.join(", ")}`);
    }
    if (session.status === "intake") {
      session = await db.updateSession(session.id, {
        status: "consented",
        consent_given_at: now().toISOString(),
        consent_variant: variant,
      });
      await writeAudit(db, {
        actor_type: "participant",
        actor_id: session.id,
        action: "session.consent",
        target_type: "session",
        target_id: session.id,
        metadata: { consent_variant: variant },
      });
    }
  } else if (body.action === "update_intake") {
    if (session.status !== "intake" && session.status !== "consented") {
      throw conflict("Intake can only be edited before the conversation starts.", "invalid_status");
    }
    const f = body.fields ?? {};
    // Validate the merged record with the same rules start-session uses.
    const merged = validateParticipantInput({
      study_id: participant0.study_id,
      display_name: f.display_name ?? participant0.display_name,
      preferred_language: f.preferred_language ?? participant0.preferred_language,
      age_band: f.age_band ?? participant0.age_band,
      reading_comfort: f.reading_comfort ?? participant0.reading_comfort,
      diagnosis_code: f.diagnosis_code ?? participant0.diagnosis_code,
      diagnosis_text: f.diagnosis_text ?? participant0.diagnosis_text ?? "",
    });
    if (merged.diagnosis_code !== participant0.diagnosis_code) {
      if (!(await db.getDiagnosis(merged.diagnosis_code))) {
        throw badRequest(`Unknown diagnosis_code "${merged.diagnosis_code}"`, "unknown_diagnosis");
      }
    }
    await db.updateParticipant(participant0.id, {
      display_name: merged.display_name,
      preferred_language: merged.preferred_language,
      age_band: merged.age_band,
      reading_comfort: merged.reading_comfort,
      diagnosis_code: merged.diagnosis_code,
      diagnosis_text: merged.diagnosis_text || null,
    });
    if (merged.preferred_language !== session.language) {
      session = await db.updateSession(session.id, { language: merged.preferred_language });
    }
    await writeAudit(db, {
      actor_type: "participant",
      actor_id: session.id,
      action: "participant.update_intake",
      target_type: "participant",
      target_id: participant0.id,
      metadata: { fields: Object.keys(f) },
    });
  } else if (body.action) {
    throw badRequest(`Unknown action "${body.action}"`);
  }

  const ctx = await loadSessionContext(db, session);
  const profile = session.status === "summary-review" || session.status === "completed"
    ? await db.getProfile(session.id)
    : null;

  const tracker = trackerStateFor(ctx, session);
  const res: SessionStateResponse = {
    session_id: session.id,
    status: session.status,
    language: session.language,
    participant: {
      display_name: ctx.participant.display_name,
      preferred_language: ctx.participant.preferred_language,
      age_band: ctx.participant.age_band,
      reading_comfort: ctx.participant.reading_comfort,
      diagnosis_code: ctx.participant.diagnosis_code,
      diagnosis_text: ctx.participant.diagnosis_text,
    },
    respondent: session.respondent,
    timepoint: session.timepoint,
    consent_variant_needed: consentVariantNeeded(ctx.participant.age_band, session.respondent),
    messages: ctx.messages.map((m) => ({
      seq: m.seq,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    })),
    coverage: { covered: ctx.coverage.covered, total_active: ctx.coverage.total_active },
    phase: tracker.phase,
    current_focus: tracker.current_focus?.construct_id ?? null,
    focus_progress: tracker.focus_progress,
    turns_used: countAssistantTurns(ctx.messages),
    max_turns: session.max_turns,
    patient_summary: profile?.patient_summary ?? null,
  };
  return jsonResponse(res, 200, origin);
}
