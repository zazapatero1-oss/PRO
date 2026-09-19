// Loads everything a session-scoped handler needs and derives the common values.

import type {
  ActiveConstruct,
  AgeBand,
  ClinicianNoteRow,
  ConsentVariant,
  ConstructEvidenceRow,
  ConstructMapRow,
  CoverageState,
  Db,
  DiagnosisCatalogRow,
  Language,
  MessageRow,
  ParticipantRow,
  ProbeFindingRow,
  ProfileJson,
  Respondent,
  SessionRow,
} from "./types.ts";
import { computeCoverage, computeTrackerState, selectActiveConstructs } from "./tracker.ts";
import type { TrackerState } from "./types.ts";
import { notFound } from "./errors.ts";
import { isMinorBand } from "./safety_messages.ts";

export interface SessionContext {
  session: SessionRow;
  participant: ParticipantRow;
  mapRow: ConstructMapRow;
  diagnosis: DiagnosisCatalogRow | null;
  notes: ClinicianNoteRow[];
  activeConstructs: ActiveConstruct[];
  evidence: ConstructEvidenceRow[];
  findings: ProbeFindingRow[];
  messages: MessageRow[];
  coverage: CoverageState;
}

export async function loadSessionContext(db: Db, session: SessionRow): Promise<SessionContext> {
  const [participant, mapRow, notes, evidence, findings, messages] = await Promise.all([
    db.getParticipant(session.participant_id),
    db.getConstructMap(session.construct_map_id),
    db.listClinicianNotes(session.id),
    db.listEvidence(session.id),
    db.listFindings(session.id),
    db.listMessages(session.id),
  ]);
  if (!participant) throw notFound("Participant not found");
  if (!mapRow) throw notFound("Construct map not found");
  const diagnosis = await db.getDiagnosis(participant.diagnosis_code);
  const clinicianFocus = notes.flatMap((n) => n.focus_constructs ?? []);
  const activeConstructs = selectActiveConstructs(
    mapRow.map,
    diagnosis?.focus_constructs ?? [],
    clinicianFocus,
    session.timepoint,
    undefined,
    session.focus_constructs ?? [],
  );
  const coverage = computeCoverage(mapRow.map, activeConstructs, evidence, findings);
  return {
    session,
    participant,
    mapRow,
    diagnosis,
    notes,
    activeConstructs,
    evidence,
    findings,
    messages,
    coverage,
  };
}

/**
 * v1.1 §B state for a loaded session. `session` is passed separately because chat-turn holds a
 * fresher row than the one the context was built from.
 */
export function trackerStateFor(
  ctx: SessionContext,
  session: SessionRow,
  budgetFraction = 0,
): TrackerState {
  return computeTrackerState({
    map: ctx.mapRow.map,
    session,
    active: ctx.activeConstructs,
    evidence: ctx.evidence,
    findings: ctx.findings,
    diagnosisFocus: ctx.diagnosis?.focus_constructs ?? [],
    assistantTurns: countAssistantTurns(ctx.messages),
    budgetFraction,
  });
}

export function countAssistantTurns(messages: MessageRow[]): number {
  return messages.filter((m) => m.role === "assistant").length;
}

export function nextSeq(messages: MessageRow[]): number {
  return messages.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
}

export function diagnosisLabel(
  diagnosis: DiagnosisCatalogRow | null,
  participant: ParticipantRow,
  language: Language,
): string {
  const label = diagnosis ? (language === "es" ? diagnosis.label_es : diagnosis.label_en) : null;
  const free = participant.diagnosis_text?.trim();
  if (label && free && free.toLowerCase() !== label.toLowerCase()) return `${label} (${free})`;
  return label ?? free ?? participant.diagnosis_code;
}

export function mapRef(mapRow: ConstructMapRow): string {
  return `${mapRow.slug}@${mapRow.version}`;
}

/** Coordinator rule: minors answering (self/both) → minor-assent; guardian → guardian; else adult. */
export function consentVariantNeeded(ageBand: AgeBand, respondent: Respondent): ConsentVariant {
  if (respondent === "guardian") return "guardian";
  if (isMinorBand(ageBand)) return "minor-assent";
  return "adult";
}

/** Most recent completed session of the same participant that ended before this one. */
export async function priorCompletedProfile(
  db: Db,
  session: SessionRow,
): Promise<{ session: SessionRow; profile: ProfileJson } | null> {
  const sessions = await db.listSessionsForParticipant(session.participant_id);
  const candidates = sessions
    .filter((s) => s.id !== session.id && s.status === "completed")
    .filter((s) => (s.ended_at ?? s.created_at) <= (session.ended_at ?? new Date().toISOString()))
    .sort((a, b) => (b.ended_at ?? b.created_at).localeCompare(a.ended_at ?? a.created_at));
  for (const s of candidates) {
    const p = await db.getProfile(s.id);
    if (p) return { session: s, profile: p.profile };
  }
  return null;
}
