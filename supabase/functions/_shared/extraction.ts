// v1.1 §C: validating and storing what the extraction call returns. Model output is untrusted:
// ids must exist in the active map, facets must belong to their construct, and a quote must
// really appear in the patient's message — anything else is dropped, never guessed at.

import type {
  ActiveConstruct,
  ConstructEvidenceInsert,
  Db,
  ExtractedEvidence,
  ExtractedFinding,
  ExtractionResult,
  FindingCategory,
  Severity,
  TriageItem,
} from "./types.ts";
import { confirmationText, facetsOf } from "./tracker.ts";

const SEVERITIES: Severity[] = ["none", "mild", "moderate", "severe", "unclear", "declined"];
const CATEGORIES: FindingCategory[] = [
  "onset",
  "trajectory",
  "triggers",
  "relief",
  "impact",
  "expectation",
  "patient_question",
  "other",
];
const INTERFERENCE = ["social", "work", "school", "sleep", "relationships", "daily-activities"];

function obj(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("input must be an object");
  }
  return input as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string, required = true): string {
  const v = o[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (!required) return "";
  throw new Error(`${key} is required`);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
}

/** Whitespace- and case-insensitive containment: the model may normalise spacing, not words. */
export function quoteIsFromMessage(quote: string, message: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(message).includes(norm(quote));
}

/**
 * Shared with confirm-summary, which re-extracts evidence from a patient correction.
 * `facets` / `triage_item` are optional there and default to empty.
 */
export function validateEvidence(
  input: unknown,
  active: ActiveConstruct[],
): ExtractedEvidence {
  const o = obj(input);
  const construct_id = str(o, "construct_id");
  const construct = active.find((c) => c.id === construct_id);
  if (!construct) {
    throw new Error(`unknown construct_id "${construct_id}"; use one of the active construct ids`);
  }
  const severity = str(o, "severity") as Severity;
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`severity must be one of ${SEVERITIES.join("|")}`);
  }
  const confidence = Number(o.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be a number between 0 and 1");
  }
  const declaredFacets = new Set(facetsOf(construct).map((f) => f.id));
  return {
    construct_id,
    patient_quote: str(o, "patient_quote"),
    quote_gloss_en: str(o, "quote_gloss_en", false) || str(o, "patient_quote"),
    severity,
    confidence: Math.round(confidence * 100) / 100,
    interference: strings(o.interference).filter((x) => INTERFERENCE.includes(x)),
    facets: strings(o.facets).filter((f) => declaredFacets.has(f)),
    triage_item: typeof o.triage_item === "string" && o.triage_item ? o.triage_item : null,
    note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
  };
}

/**
 * Turns the raw extraction JSON into something safe to store. Invalid items are dropped with a
 * log line rather than failing the turn: the patient already has their reply.
 */
export function validateExtraction(
  value: unknown,
  active: ActiveConstruct[],
  triage: TriageItem[],
  patientMessage: string,
): ExtractionResult {
  const o = obj(value);
  const activeIds = new Set(active.map((c) => c.id));
  const triageIds = new Set(triage.map((t) => t.id));

  const evidence: ExtractedEvidence[] = [];
  for (const raw of Array.isArray(o.evidence) ? o.evidence : []) {
    try {
      const ev = validateEvidence(raw, active);
      if (ev.triage_item && !triageIds.has(ev.triage_item)) ev.triage_item = null;
      if (!quoteIsFromMessage(ev.patient_quote, patientMessage)) {
        console.warn("dropping extracted evidence whose quote is not in the patient message");
        continue;
      }
      evidence.push(ev);
    } catch (err) {
      console.warn("dropping invalid extracted evidence", (err as Error).message);
    }
  }

  const findings: ExtractedFinding[] = [];
  for (const raw of Array.isArray(o.findings) ? o.findings : []) {
    const f = (raw ?? {}) as Record<string, unknown>;
    const construct_id = typeof f.construct_id === "string" ? f.construct_id : "";
    const category = typeof f.category === "string" ? f.category as FindingCategory : "other";
    const finding = typeof f.finding === "string" ? f.finding.trim() : "";
    if (!activeIds.has(construct_id) || !finding) continue;
    findings.push({
      construct_id,
      category: CATEGORIES.includes(category) ? category : "other",
      finding: finding.slice(0, 500),
    });
  }

  return {
    evidence,
    findings,
    declined: strings(o.declined).filter((id) => activeIds.has(id)),
    triage_answered: strings(o.triage_answered).filter((id) => triageIds.has(id)),
    confirmed: strings(o.confirmed).filter((id) => activeIds.has(id)),
    patient_questions: strings(o.patient_questions).map((q) => q.trim().slice(0, 500)),
  };
}

export interface PersistExtractionInput {
  db: Db;
  sessionId: string;
  /** The patient message the evidence came from. */
  messageId: string;
  patientMessage: string;
  /** What the assistant had just said: the reflection a confirmation refers to. */
  lastAssistantMessage: string | null;
  result: ExtractionResult;
  /** Constructs already confirmed, so a repeated "yes" does not pile up rows. */
  alreadyConfirmed: ReadonlySet<string>;
  /** Where a patient question is filed when it is not about one construct. */
  defaultConstructId: string | null;
}

export interface PersistedEvidenceEvent {
  construct_id: string;
  severity: Severity;
  confidence: number;
}

/**
 * Writes everything one turn produced. Declines become `declined` evidence rows (the tracker
 * reads them as closed), confirmations become `probe_findings` rows marked with
 * `confirmationText` (see tracker.ts for why the marker lives there).
 */
export async function persistExtraction(
  input: PersistExtractionInput,
): Promise<PersistedEvidenceEvent[]> {
  const { db, result } = input;
  const events: PersistedEvidenceEvent[] = [];

  for (const ev of result.evidence) {
    const row: ConstructEvidenceInsert = {
      session_id: input.sessionId,
      construct_id: ev.construct_id,
      message_id: input.messageId,
      patient_quote: ev.patient_quote,
      quote_gloss_en: ev.quote_gloss_en,
      severity: ev.severity,
      confidence: ev.confidence,
      interference: ev.interference,
      facets: ev.facets,
      triage_item: ev.triage_item ?? null,
      note: ev.note ?? null,
      superseded_by: null,
    };
    await db.insertEvidence(row);
    events.push({
      construct_id: ev.construct_id,
      severity: ev.severity,
      confidence: ev.confidence,
    });
  }

  const declinedAlready = new Set(
    result.evidence.filter((e) => e.severity === "declined").map((e) => e.construct_id),
  );
  for (const id of result.declined) {
    if (declinedAlready.has(id)) continue;
    await db.insertEvidence({
      session_id: input.sessionId,
      construct_id: id,
      message_id: input.messageId,
      patient_quote: input.patientMessage,
      quote_gloss_en: input.patientMessage,
      severity: "declined",
      confidence: 1,
      interference: [],
      facets: [],
      triage_item: null,
      note: "declined by patient",
      superseded_by: null,
    });
    events.push({ construct_id: id, severity: "declined", confidence: 1 });
  }

  for (const f of result.findings) {
    await db.insertFinding({
      session_id: input.sessionId,
      construct_id: f.construct_id,
      category: f.category,
      finding: f.finding,
      message_id: input.messageId,
    });
  }

  for (const id of result.confirmed) {
    if (input.alreadyConfirmed.has(id)) continue;
    await db.insertFinding({
      session_id: input.sessionId,
      construct_id: id,
      category: "other",
      finding: confirmationText((input.lastAssistantMessage ?? "").slice(0, 300)),
      message_id: input.messageId,
    });
  }

  // A question may arrive in both lists; store it once.
  const storedQuestions = new Set(
    result.findings.filter((f) => f.category === "patient_question").map((f) => f.finding),
  );
  for (const q of result.patient_questions) {
    const constructId = input.defaultConstructId;
    if (!constructId || storedQuestions.has(q)) continue;
    storedQuestions.add(q);
    await db.insertFinding({
      session_id: input.sessionId,
      construct_id: constructId,
      category: "patient_question",
      finding: q,
      message_id: input.messageId,
    });
  }

  return events;
}
