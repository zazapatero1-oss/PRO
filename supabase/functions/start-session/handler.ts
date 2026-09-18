// start-session: clinician creates (or reuses) a participant and opens a session (SPEC §7.7).

import type {
  AgeBand,
  AuthClient,
  Db,
  Language,
  ParticipantInput,
  ReadingComfort,
  Respondent,
  StartSessionRequest,
  StartSessionResponse,
  Timepoint,
} from "../_shared/types.ts";
import { badRequest, HttpError, jsonResponse } from "../_shared/errors.ts";
import { requireClinician } from "../_shared/auth.ts";
import { generateResumeToken, hashToken, writeAudit } from "../_shared/db.ts";
import { DEFAULT_MAX_TURNS, DEFAULT_TARGET_MINUTES } from "../_shared/config.ts";
import { isMinorBand } from "../_shared/safety_messages.ts";

export interface StartSessionDeps {
  db: Db;
  auth: AuthClient;
  model: string;
  promptVersion: string;
  origin?: string;
}

const LANGUAGES: Language[] = ["en", "es"];
const AGE_BANDS: AgeBand[] = ["under-8", "8-12", "13-17", "18-29", "30-49", "50-69", "70-plus"];
const READING: ReadingComfort[] = ["short-messages", "comfortable", "prefer-voice"];
const RESPONDENTS: Respondent[] = ["self", "guardian", "both"];
const TIMEPOINTS: Timepoint[] = [
  "baseline",
  "pre-op",
  "post-op-2w",
  "post-op-6w",
  "post-op-6m",
  "post-op-12m",
  "follow-up",
];

function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw badRequest(`${field} must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function text(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string" || !v.trim()) throw badRequest(`${field} is required`);
  if (v.length > max) throw badRequest(`${field} is too long`);
  return v.trim();
}

export function validateParticipantInput(raw: unknown): ParticipantInput {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    study_id: typeof p.study_id === "string" && p.study_id.trim() ? p.study_id.trim() : null,
    display_name: text(p.display_name, "participant.display_name", 80),
    preferred_language: oneOf(p.preferred_language, LANGUAGES, "participant.preferred_language"),
    age_band: oneOf(p.age_band, AGE_BANDS, "participant.age_band"),
    reading_comfort: oneOf(p.reading_comfort, READING, "participant.reading_comfort"),
    diagnosis_code: text(p.diagnosis_code, "participant.diagnosis_code", 60),
    diagnosis_text: typeof p.diagnosis_text === "string"
      ? p.diagnosis_text.trim().slice(0, 500)
      : "",
  };
}

export function validateStartSession(raw: unknown): StartSessionRequest {
  const b = (raw ?? {}) as Record<string, unknown>;
  const note = b.clinician_note as Record<string, unknown> | null | undefined;
  return {
    participant: validateParticipantInput(b.participant),
    timepoint: oneOf(b.timepoint, TIMEPOINTS, "timepoint"),
    respondent: oneOf(b.respondent, RESPONDENTS, "respondent"),
    clinician_note: note && typeof note === "object"
      ? {
        note: typeof note.note === "string" ? note.note.trim().slice(0, 2000) : "",
        focus_constructs: Array.isArray(note.focus_constructs)
          ? note.focus_constructs.filter((x): x is string => typeof x === "string")
          : [],
      }
      : null,
  };
}

export async function handleStartSession(
  deps: StartSessionDeps,
  req: Request,
  raw: unknown,
): Promise<Response> {
  const origin = deps.origin ?? "*";
  const clinician = await requireClinician(req, deps);
  const body = validateStartSession(raw);
  const { db } = deps;

  const diagnosis = await db.getDiagnosis(body.participant.diagnosis_code);
  if (!diagnosis) {
    throw badRequest(
      `Unknown diagnosis_code "${body.participant.diagnosis_code}"`,
      "unknown_diagnosis",
    );
  }

  // Participant: reuse by study_id when given, else create with a fresh unique study_id.
  const fields = {
    display_name: body.participant.display_name,
    preferred_language: body.participant.preferred_language,
    age_band: body.participant.age_band,
    reading_comfort: body.participant.reading_comfort,
    diagnosis_code: body.participant.diagnosis_code,
    diagnosis_text: body.participant.diagnosis_text || null,
  };
  let participant = body.participant.study_id
    ? await db.getParticipantByStudyId(body.participant.study_id)
    : null;
  if (participant) {
    participant = await db.updateParticipant(participant.id, fields);
  } else {
    const studyId = body.participant.study_id ?? (await db.nextStudyId());
    participant = await db.insertParticipant({
      study_id: studyId,
      is_demo: false,
      deleted_at: null,
      ...fields,
    });
  }

  const pediatric = isMinorBand(participant.age_band);
  const slug = pediatric ? diagnosis.default_map_slug_pediatric : diagnosis.default_map_slug_adult;
  const mapRow = await db.getLatestApprovedMap(slug);
  if (!mapRow) {
    throw new HttpError(500, "no_approved_map", `No approved construct map for "${slug}"`);
  }

  const token = generateResumeToken();
  const session = await db.insertSession({
    participant_id: participant.id,
    timepoint: body.timepoint,
    respondent: body.respondent,
    language: participant.preferred_language,
    construct_map_id: mapRow.id,
    prompt_version: deps.promptVersion,
    model_id: deps.model,
    status: "intake",
    resume_token_hash: await hashToken(token),
    max_turns: DEFAULT_MAX_TURNS,
    target_minutes: DEFAULT_TARGET_MINUTES,
    started_at: null,
    ended_at: null,
    consent_given_at: null,
    consent_variant: null,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd_estimate: null,
  });

  if (
    body.clinician_note && (body.clinician_note.note || body.clinician_note.focus_constructs.length)
  ) {
    await db.insertClinicianNote({
      session_id: session.id,
      clinician_id: clinician.clinicianId,
      note: body.clinician_note.note,
      focus_constructs: body.clinician_note.focus_constructs,
    });
  }

  await writeAudit(db, {
    actor_type: "clinician",
    actor_id: clinician.clinicianId,
    action: "session.create",
    target_type: "session",
    target_id: session.id,
    metadata: {
      participant_id: participant.id,
      timepoint: body.timepoint,
      map: `${mapRow.slug}@${mapRow.version}`,
    },
  });

  const res: StartSessionResponse = {
    session_id: session.id,
    participant_id: participant.id,
    study_id: participant.study_id,
    resume_token: token,
    patient_link_path: `/p/${token}`,
  };
  return jsonResponse(res, 201, origin);
}
