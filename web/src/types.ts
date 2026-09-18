// Client-facing shapes mirrored from SPEC §5–§8 and the edge-function contracts.
// Keep in sync with supabase/functions/_shared/types.ts.

export type Language = 'en' | 'es'
export const LANGUAGES: Language[] = ['en', 'es']

export type AgeBand = 'under-8' | '8-12' | '13-17' | '18-29' | '30-49' | '50-69' | '70-plus'
export const AGE_BANDS: AgeBand[] = ['under-8', '8-12', '13-17', '18-29', '30-49', '50-69', '70-plus']

export type ReadingComfort = 'short-messages' | 'comfortable' | 'prefer-voice'
export const READING_COMFORTS: ReadingComfort[] = ['short-messages', 'comfortable', 'prefer-voice']

export type Respondent = 'self' | 'guardian' | 'both'
export const RESPONDENTS: Respondent[] = ['self', 'guardian', 'both']

export type Timepoint =
  | 'baseline'
  | 'pre-op'
  | 'post-op-2w'
  | 'post-op-6w'
  | 'post-op-6m'
  | 'post-op-12m'
  | 'follow-up'
export const TIMEPOINTS: Timepoint[] = [
  'baseline',
  'pre-op',
  'post-op-2w',
  'post-op-6w',
  'post-op-6m',
  'post-op-12m',
  'follow-up',
]

export type SessionStatus =
  | 'intake'
  | 'consented'
  | 'active'
  | 'wrapping-up'
  | 'summary-review'
  | 'completed'
  | 'abandoned'
  | 'safety-halted'

export type ConsentVariant = 'adult' | 'minor-assent' | 'guardian'

export type Severity = 'none' | 'mild' | 'moderate' | 'severe' | 'unclear' | 'declined'
export const SEVERITY_ORDER: Severity[] = ['none', 'mild', 'moderate', 'severe']

export type Interference = 'social' | 'work' | 'school' | 'sleep' | 'relationships' | 'daily-activities'

export type FindingCategory =
  | 'onset'
  | 'trajectory'
  | 'triggers'
  | 'relief'
  | 'impact'
  | 'expectation'
  | 'patient_question'
  | 'other'

export type ConstructStatus =
  | 'untouched'
  | 'partial'
  | 'covered'
  | 'declined'
  | 'needs_clarification'
  | 'drill_down_pending'
  | 'drill_down_done'

export type InputMode = 'text' | 'voice'

// ---- Construct map (§6) ----

export interface ConstructDef {
  id: string
  label: string
  description: string
  severity_signals: Partial<Record<'none' | 'mild' | 'moderate' | 'severe', string>>
  drill_down: string[]
  age_variants?: Record<string, { description?: string; drill_down?: string[] }>
  priority: 'core' | 'standard' | 'optional'
  source_refs?: { instrument: string; scale: string }[]
}

export interface DomainDef {
  id: string
  label: string
  weight: number
  constructs: ConstructDef[]
}

export interface ConstructMap {
  slug: string
  version: number
  population: 'adult' | 'pediatric'
  language: string
  domains: DomainDef[]
  coverage_rules: {
    min_confidence_to_count: number
    drill_down_threshold: Severity
    core_constructs_required: boolean
    max_constructs_per_session: number
  }
}

export interface ConstructMapRow {
  id: string
  slug: string
  version: number
  population: 'adult' | 'pediatric'
  source_instrument_ids: string[]
  map: ConstructMap
  status: 'draft' | 'approved' | 'retired'
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export interface InstrumentRow {
  id: string
  slug: string
  name: string
  version: string
  publisher: string
  license_notes: string
  license_url: string | null
  item_text_stored: boolean
  created_at: string
}

export interface DiagnosisCatalogEntry {
  id: string
  code: string
  label_en: string
  label_es: string
  module: 'aesthetics' | 'craniofacial' | 'head-neck-cancer' | 'skin-cancer'
  default_map_slug_adult: string
  default_map_slug_pediatric: string
  focus_constructs: string[]
}

// ---- Rows (§5) ----

export interface Participant {
  id: string
  study_id: string
  display_name: string
  preferred_language: Language
  age_band: AgeBand
  reading_comfort: ReadingComfort
  diagnosis_code: string
  diagnosis_text: string
  is_demo: boolean
  deleted_at: string | null
  created_at: string
}

export interface SessionRow {
  id: string
  participant_id: string
  timepoint: Timepoint
  respondent: Respondent
  language: Language
  construct_map_id: string
  prompt_version: string
  model_id: string
  status: SessionStatus
  max_turns: number
  target_minutes: number
  started_at: string | null
  ended_at: string | null
  consent_given_at: string | null
  consent_variant: ConsentVariant | null
  input_tokens: number
  output_tokens: number
  cost_usd_estimate: number | null
  created_at: string
}

export interface MessageRow {
  id: string
  session_id: string
  seq: number
  role: 'patient' | 'assistant' | 'system-event'
  content: string
  input_mode: InputMode | null
  tokens_in: number | null
  tokens_out: number | null
  latency_ms: number | null
  created_at: string
}

export interface ConstructEvidenceRow {
  id: string
  session_id: string
  construct_id: string
  message_id: string | null
  patient_quote: string
  quote_gloss_en: string
  severity: Severity
  confidence: number
  interference: Interference[]
  note: string | null
  superseded_by: string | null
  created_at: string
}

export interface ProbeFindingRow {
  id: string
  session_id: string
  construct_id: string
  finding: string
  category: FindingCategory
  message_id: string | null
  created_at: string
}

export interface SafetyFlagRow {
  id: string
  session_id: string
  message_id: string | null
  trigger: 'self_harm' | 'abuse' | 'acute_distress' | 'other'
  detected_by: 'keyword' | 'model'
  action_taken: string
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface ClinicianNoteRow {
  id: string
  session_id: string
  clinician_id: string
  note: string
  focus_constructs: string[]
  created_at: string
}

// ---- Profile (§8) ----

export interface ProfileQuote {
  text: string
  lang: string
  gloss_en: string
}

export interface ProfileFinding {
  category: FindingCategory
  text: string
}

export interface ProfileConstruct {
  id: string
  severity: Severity
  confidence: number
  quotes: ProfileQuote[]
  findings: ProfileFinding[]
  status: ConstructStatus
}

export interface ProfileDomain {
  id: string
  label: string
  severity: Severity
  confidence: number
  summary_en: string
  constructs: ProfileConstruct[]
}

export interface Profile {
  generated_with: { model: string; prompt_version: string; map: string }
  domains: ProfileDomain[]
  needs_clarification: { construct_id: string; reason: string }[]
  not_covered: string[]
  declined: string[]
  patient_questions: string[]
  change_from_prior: { construct_id: string; prior: Severity; now: Severity; note: string }[]
  disclaimer: string
}

export interface SessionProfileRow {
  session_id: string
  profile: Profile
  patient_summary: string
  patient_summary_confirmed_at: string | null
  patient_corrections: PatientCorrection[] | null
  generated_at: string
}

export interface PatientCorrection {
  construct_id?: string | null
  patient_text: string
}

// ---- Edge-function contracts ----

export interface StartSessionInput {
  participant: {
    study_id?: string | null
    display_name: string
    preferred_language: Language
    age_band: AgeBand
    reading_comfort: ReadingComfort
    diagnosis_code: string
    diagnosis_text: string
  }
  timepoint: Timepoint
  respondent: Respondent
  clinician_note?: { note: string; focus_constructs: string[] }
}

export interface StartSessionResult {
  session_id: string
  participant_id: string
  study_id: string
  resume_token: string
  patient_link_path: string
}

export interface SessionStateParticipant {
  display_name: string
  preferred_language: Language
  age_band: AgeBand
  reading_comfort: ReadingComfort
  diagnosis_code: string
  diagnosis_text: string
}

export interface SessionState {
  session_id: string
  status: SessionStatus
  language: Language
  participant: SessionStateParticipant
  respondent: Respondent
  timepoint: Timepoint
  consent_variant_needed: ConsentVariant
  messages: { seq: number; role: MessageRow['role']; content: string; created_at: string }[]
  coverage: { covered: number; total_active: number }
  turns_used: number
  max_turns: number
  patient_summary?: string | null
}

export type IntakeFields = Partial<SessionStateParticipant>

// §7.6 streaming events
export type ChatEvent =
  | { event: 'token'; data: { t: string } }
  | { event: 'evidence'; data: { construct_id: string; severity: Severity; confidence: number } }
  | {
      event: 'status'
      data: { coverage: { covered: number; total_active: number }; turns_used: number; max_turns: number }
    }
  | { event: 'safety'; data: { message: string } }
  | { event: 'ended'; data: { reason: 'coverage_complete' | 'turn_budget' | 'patient_requested' } }
  | { event: 'error'; data: { retryable: boolean; message: string } }

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean }
}

// ---- Clinician read shapes (assembled client-side from supabase-js reads) ----

export interface ParticipantListItem {
  participant: Participant
  timepoints_completed: Timepoint[]
  last_session_status: SessionStatus | null
  last_session_at: string | null
  flag_count: number
}

export interface TimelineSession {
  session: SessionRow
  profile: SessionProfileRow | null
  flag_count: number
}

export interface ParticipantTimeline {
  participant: Participant
  sessions: TimelineSession[]
}

export interface SessionDetail {
  session: SessionRow
  participant: Participant
  messages: MessageRow[]
  evidence: ConstructEvidenceRow[]
  findings: ProbeFindingRow[]
  profile: SessionProfileRow | null
  safety_flags: SafetyFlagRow[]
  clinician_notes: ClinicianNoteRow[]
  construct_map: ConstructMapRow | null
  prior_session: { session: SessionRow; profile: SessionProfileRow | null } | null
}
