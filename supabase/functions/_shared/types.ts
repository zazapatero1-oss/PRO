// Cross-boundary shapes for the FACE-Q Conversation edge functions.
// Mirrors SPEC §5 (rows), §6 (construct map), §7 (engine), §7.6 (SSE), §8 (profile).
// The web worker mirrors the client-facing subset in web/src/types.ts.

import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Enumerations (text + check constraints in the DB)
// ---------------------------------------------------------------------------

export type Language = "en" | "es";
export type Population = "adult" | "pediatric";
export type AgeBand =
  | "under-8"
  | "8-12"
  | "13-17"
  | "18-29"
  | "30-49"
  | "50-69"
  | "70-plus";
export type ReadingComfort = "short-messages" | "comfortable" | "prefer-voice";
export type Respondent = "self" | "guardian" | "both";
export type Timepoint =
  | "baseline"
  | "pre-op"
  | "post-op-2w"
  | "post-op-6w"
  | "post-op-6m"
  | "post-op-12m"
  | "follow-up";
export type SessionStatus =
  | "intake"
  | "consented"
  | "active"
  | "wrapping-up"
  | "summary-review"
  | "completed"
  | "abandoned"
  | "safety-halted";
export type ConsentVariant = "adult" | "minor-assent" | "guardian";
export type MessageRole = "patient" | "assistant" | "system-event";
export type InputMode = "text" | "voice";
export type Severity = "none" | "mild" | "moderate" | "severe" | "unclear" | "declined";
/** Severity levels that carry a rank (used for thresholds, medians, conflicts). */
export type RankedSeverity = "none" | "mild" | "moderate" | "severe";
export type Interference =
  | "social"
  | "work"
  | "school"
  | "sleep"
  | "relationships"
  | "daily-activities";
export type FindingCategory =
  | "onset"
  | "trajectory"
  | "triggers"
  | "relief"
  | "impact"
  | "expectation"
  | "patient_question"
  | "other";
export type SafetyTrigger = "self_harm" | "abuse" | "acute_distress" | "other";
export type SafetyDetectedBy = "keyword" | "model";
export type ConstructPriority = "core" | "standard" | "optional";
export type MapStatus = "draft" | "approved" | "retired";
export type ActorType = "clinician" | "participant" | "system";
export type EndReason = "coverage_complete" | "turn_budget" | "patient_requested";

// ---------------------------------------------------------------------------
// §6 Construct map (jsonb)
// ---------------------------------------------------------------------------

export interface SeveritySignals {
  none: string;
  mild: string;
  moderate: string;
  severe: string;
}

export interface ConstructAgeVariant {
  description?: string;
  drill_down?: string[];
  label?: string;
}

export interface SourceRef {
  instrument: string;
  scale: string;
}

export interface Construct {
  id: string;
  label: string;
  description: string;
  severity_signals: SeveritySignals;
  drill_down: string[];
  age_variants?: { pediatric?: ConstructAgeVariant };
  priority: ConstructPriority;
  source_refs?: SourceRef[];
  /** Seed maps set this on recovery.* / outcome.*: active only at these timepoints. */
  applicable_timepoints?: Timepoint[];
}

export interface Domain {
  id: string;
  label: string;
  weight: number;
  constructs: Construct[];
}

export interface CoverageRules {
  min_confidence_to_count: number;
  drill_down_threshold: RankedSeverity;
  core_constructs_required: boolean;
  max_constructs_per_session: number;
}

export interface ConstructMap {
  slug: string;
  version: number;
  population: Population;
  language: string;
  domains: Domain[];
  coverage_rules: CoverageRules;
}

/** A construct selected for this session, with its domain and focus flag attached. */
export interface ActiveConstruct extends Construct {
  domain_id: string;
  domain_label: string;
  focus: boolean;
}

// ---------------------------------------------------------------------------
// §5 Row types
// ---------------------------------------------------------------------------

export interface InstrumentRow {
  id: string;
  slug: string;
  name: string;
  version: string | null;
  publisher: string | null;
  license_notes: string;
  license_url: string | null;
  item_text_stored: boolean;
  created_at: string;
}

export interface ConstructMapRow {
  id: string;
  slug: string;
  version: number;
  population: Population;
  source_instrument_ids: string[];
  map: ConstructMap;
  status: MapStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface DiagnosisCatalogRow {
  id: string;
  code: string;
  label_en: string;
  label_es: string;
  module: "aesthetics" | "craniofacial" | "head-neck-cancer" | "skin-cancer";
  default_map_slug_adult: string;
  default_map_slug_pediatric: string;
  focus_constructs: string[];
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  study_id: string;
  display_name: string;
  preferred_language: Language;
  age_band: AgeBand;
  reading_comfort: ReadingComfort;
  diagnosis_code: string;
  diagnosis_text: string | null;
  is_demo: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  participant_id: string;
  timepoint: Timepoint;
  respondent: Respondent;
  language: Language;
  construct_map_id: string;
  prompt_version: string;
  model_id: string;
  status: SessionStatus;
  resume_token_hash: string;
  /** Links stop working after this; set on creation (SPEC §4). */
  resume_token_expires_at: string | null;
  max_turns: number;
  target_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  consent_given_at: string | null;
  consent_variant: ConsentVariant | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd_estimate: number | null;
  created_at: string;
}

export interface ClinicianNoteRow {
  id: string;
  session_id: string;
  clinician_id: string;
  note: string;
  focus_constructs: string[];
  created_at: string;
}

export interface MessageRow {
  id: string;
  session_id: string;
  seq: number;
  role: MessageRole;
  content: string;
  input_mode: InputMode | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface ConstructEvidenceRow {
  id: string;
  session_id: string;
  construct_id: string;
  /** Nullable in the DB; evidence created by chat-turn always links the patient message. */
  message_id: string | null;
  patient_quote: string;
  quote_gloss_en: string;
  severity: Severity;
  confidence: number;
  interference: string[];
  note: string | null;
  superseded_by: string | null;
  created_at: string;
}

export interface ProbeFindingRow {
  id: string;
  session_id: string;
  construct_id: string;
  finding: string;
  category: FindingCategory;
  message_id: string | null;
  created_at: string;
}

export interface SessionProfileRow {
  session_id: string;
  profile: ProfileJson;
  patient_summary: string;
  patient_summary_confirmed_at: string | null;
  patient_corrections: PatientCorrectionsJson | null;
  generated_at: string;
}

export interface SafetyFlagRow {
  id: string;
  session_id: string;
  message_id: string | null;
  trigger: SafetyTrigger;
  detected_by: SafetyDetectedBy;
  action_taken: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_type: ActorType;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ClinicianRow {
  id: string;
  display_name: string;
  created_at: string;
}

// Insert shapes: everything the function supplies; DB fills id/created_at unless given.
type Insert<Row> = Omit<Row, "id" | "created_at"> & { id?: string; created_at?: string };
export type ParticipantInsert = Insert<ParticipantRow>;
export type SessionInsert = Insert<SessionRow>;
export type ClinicianNoteInsert = Insert<ClinicianNoteRow>;
export type MessageInsert = Insert<MessageRow>;
export type ConstructEvidenceInsert = Insert<ConstructEvidenceRow>;
export type ProbeFindingInsert = Insert<ProbeFindingRow>;
export type SafetyFlagInsert = Insert<SafetyFlagRow>;
export type ConstructMapInsert = Insert<ConstructMapRow>;
export type AuditInsert = Insert<AuditLogRow>;
export type SessionProfileInsert = Omit<SessionProfileRow, "generated_at"> & {
  generated_at?: string;
};

// ---------------------------------------------------------------------------
// §7.1 Coverage state
// ---------------------------------------------------------------------------

export type CoverageStatus =
  | "untouched"
  | "partial"
  | "covered"
  | "declined"
  | "needs_clarification"
  | "drill_down_pending"
  | "drill_down_done";

export interface ConstructCoverage {
  construct_id: string;
  label: string;
  domain_id: string;
  priority: ConstructPriority;
  focus: boolean;
  status: CoverageStatus;
  /** Current severity when known (latest counting evidence row). */
  severity: Severity | null;
  confidence: number | null;
  evidence_count: number;
  finding_count: number;
}

export interface CoverageState {
  constructs: ConstructCoverage[];
  covered: number;
  total_active: number;
  complete: boolean;
}

// ---------------------------------------------------------------------------
// §7.3 Tool inputs
// ---------------------------------------------------------------------------

export interface RecordEvidenceInput {
  construct_id: string;
  patient_quote: string;
  quote_gloss_en: string;
  severity: Severity;
  confidence: number;
  interference: string[];
  note?: string | null;
}

export interface RecordProbeFindingInput {
  construct_id: string;
  category: FindingCategory;
  finding: string;
}

export interface MarkDeclinedInput {
  construct_id: string;
  reason: string;
}

export interface RaiseSafetyFlagInput {
  trigger: SafetyTrigger;
  rationale: string;
}

export interface EndSessionInput {
  reason: EndReason;
}

export type ToolName =
  | "record_evidence"
  | "record_probe_finding"
  | "mark_declined"
  | "raise_safety_flag"
  | "end_session";

// ---------------------------------------------------------------------------
// §7.6 SSE events
// ---------------------------------------------------------------------------

export type SseEvent =
  | { event: "token"; data: { t: string } }
  | { event: "evidence"; data: { construct_id: string; severity: Severity; confidence: number } }
  | {
    event: "status";
    data: {
      coverage: { covered: number; total_active: number };
      turns_used: number;
      max_turns: number;
    };
  }
  | { event: "safety"; data: { message: string } }
  | { event: "ended"; data: { reason: EndReason } }
  | { event: "debug"; data: unknown }
  | { event: "error"; data: { retryable: boolean; message: string } };

// ---------------------------------------------------------------------------
// §8 Profile JSON
// ---------------------------------------------------------------------------

export interface ProfileQuote {
  text: string;
  lang: string;
  gloss_en: string;
}

export interface ProfileFinding {
  category: FindingCategory;
  text: string;
}

export interface ProfileConstruct {
  id: string;
  label: string;
  severity: Severity;
  confidence: number;
  quotes: ProfileQuote[];
  findings: ProfileFinding[];
  status: CoverageStatus;
}

export interface ProfileDomain {
  id: string;
  label: string;
  severity: Severity;
  confidence: number;
  summary_en: string;
  /** Present when the domain severity is a median over ≥2 constructs (SPEC §8 "worst noted"). */
  worst_severity?: Severity;
  constructs: ProfileConstruct[];
}

export interface ProfileChange {
  construct_id: string;
  prior: Severity;
  now: Severity;
  note: string;
}

export interface ProfileJson {
  generated_with: { model: string; prompt_version: string; map: string };
  domains: ProfileDomain[];
  needs_clarification: { construct_id: string; reason: string }[];
  not_covered: string[];
  declined: string[];
  patient_questions: string[];
  change_from_prior: ProfileChange[];
  disclaimer: string;
}

export const PROFILE_DISCLAIMER = "AI-assisted inferred profile. Not a validated FACE-Q score.";

export interface PatientCorrection {
  construct_id?: string | null;
  patient_text: string;
}

export interface PatientCorrectionsJson {
  corrections: PatientCorrection[];
  extracted: RecordEvidenceInput[];
  applied_at: string;
}

// ---------------------------------------------------------------------------
// Request / response bodies (binding for web + eval workers)
// ---------------------------------------------------------------------------

export interface ParticipantInput {
  study_id?: string | null;
  display_name: string;
  preferred_language: Language;
  age_band: AgeBand;
  reading_comfort: ReadingComfort;
  diagnosis_code: string;
  diagnosis_text: string;
}

export interface StartSessionRequest {
  participant: ParticipantInput;
  timepoint: Timepoint;
  respondent: Respondent;
  clinician_note?: { note: string; focus_constructs: string[] } | null;
}

export interface StartSessionResponse {
  session_id: string;
  participant_id: string;
  study_id: string;
  resume_token: string;
  patient_link_path: string;
}

export interface SessionStateRequest {
  resume_token: string;
  action?: "consent" | "update_intake";
  consent_variant?: ConsentVariant;
  fields?: Partial<
    Pick<
      ParticipantInput,
      | "display_name"
      | "preferred_language"
      | "age_band"
      | "reading_comfort"
      | "diagnosis_code"
      | "diagnosis_text"
    >
  >;
}

export interface SessionStateResponse {
  session_id: string;
  status: SessionStatus;
  language: Language;
  participant: {
    display_name: string;
    preferred_language: Language;
    age_band: AgeBand;
    reading_comfort: ReadingComfort;
    diagnosis_code: string;
    diagnosis_text: string | null;
  };
  respondent: Respondent;
  timepoint: Timepoint;
  consent_variant_needed: ConsentVariant;
  messages: { seq: number; role: MessageRole; content: string; created_at: string }[];
  coverage: { covered: number; total_active: number };
  turns_used: number;
  max_turns: number;
  patient_summary: string | null;
}

export interface ChatTurnRequest {
  session_id: string;
  resume_token: string;
  text: string | null;
  input_mode: InputMode | null;
}

export interface EndSessionRequest {
  resume_token?: string;
  session_id?: string;
}

export interface EndSessionResponse {
  status: "summary-review";
  patient_summary: string;
}

export interface ConfirmSummaryRequest {
  resume_token: string;
  corrections: PatientCorrection[];
  confirmed: true;
}

export interface ConfirmSummaryResponse {
  status: "completed";
}

export interface DeleteParticipantRequest {
  participant_id: string;
}

export interface ReopenSessionRequest {
  session_id: string;
}

export interface IngestInstrumentRequest {
  instrument_slug: string;
  text: string;
  population: Population;
}

export interface ApproveMapRequest {
  action: "approve";
  construct_map_id: string;
}

export interface ErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

/**
 * Repository interface over the service-role Supabase client. Handlers depend on this
 * rather than on supabase-js so they can be unit-tested with an in-memory fake.
 */
export interface Db {
  getClinician(id: string): Promise<ClinicianRow | null>;
  getDiagnosis(code: string): Promise<DiagnosisCatalogRow | null>;

  getParticipant(id: string): Promise<ParticipantRow | null>;
  getParticipantByStudyId(studyId: string): Promise<ParticipantRow | null>;
  insertParticipant(row: ParticipantInsert): Promise<ParticipantRow>;
  /** Calls `public.next_study_id()` (SPEC §5 study ids are DB-generated). */
  nextStudyId(): Promise<string>;
  updateParticipant(id: string, patch: Partial<ParticipantInsert>): Promise<ParticipantRow>;
  deleteParticipant(id: string): Promise<void>;

  getInstrumentBySlug(slug: string): Promise<InstrumentRow | null>;
  getConstructMap(id: string): Promise<ConstructMapRow | null>;
  getLatestApprovedMap(slug: string): Promise<ConstructMapRow | null>;
  getMaxMapVersion(slug: string): Promise<number>;
  insertConstructMap(row: ConstructMapInsert): Promise<ConstructMapRow>;
  updateConstructMap(id: string, patch: Partial<ConstructMapInsert>): Promise<ConstructMapRow>;

  getSession(id: string): Promise<SessionRow | null>;
  getSessionByTokenHash(hash: string): Promise<SessionRow | null>;
  insertSession(row: SessionInsert): Promise<SessionRow>;
  updateSession(id: string, patch: Partial<SessionInsert>): Promise<SessionRow>;
  listSessionsForParticipant(participantId: string): Promise<SessionRow[]>;

  listClinicianNotes(sessionId: string): Promise<ClinicianNoteRow[]>;
  insertClinicianNote(row: ClinicianNoteInsert): Promise<ClinicianNoteRow>;

  listMessages(sessionId: string): Promise<MessageRow[]>;
  insertMessage(row: MessageInsert): Promise<MessageRow>;

  listEvidence(sessionId: string): Promise<ConstructEvidenceRow[]>;
  insertEvidence(row: ConstructEvidenceInsert): Promise<ConstructEvidenceRow>;
  updateEvidence(id: string, patch: Partial<ConstructEvidenceInsert>): Promise<void>;

  listFindings(sessionId: string): Promise<ProbeFindingRow[]>;
  insertFinding(row: ProbeFindingInsert): Promise<ProbeFindingRow>;

  getProfile(sessionId: string): Promise<SessionProfileRow | null>;
  upsertProfile(row: SessionProfileInsert): Promise<SessionProfileRow>;

  listSafetyFlags(sessionId: string): Promise<SafetyFlagRow[]>;
  insertSafetyFlag(row: SafetyFlagInsert): Promise<SafetyFlagRow>;
  reviewSafetyFlags(sessionId: string, clinicianId: string, at: string): Promise<void>;

  insertAudit(row: AuditInsert): Promise<void>;
}

/** Validates a user JWT; wraps supabase-js `auth.getUser`. */
export interface AuthClient {
  getUser(jwt: string): Promise<{ id: string } | null>;
}

/** The subset of the Anthropic SDK client the functions use; fakes implement this in tests. */
export interface MessageStreamLike {
  on(event: "text", listener: (delta: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
}

export interface AnthropicClientLike {
  messages: {
    stream(params: Anthropic.MessageStreamParams): MessageStreamLike;
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}
