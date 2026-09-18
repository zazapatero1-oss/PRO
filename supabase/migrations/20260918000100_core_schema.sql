-- FACE-Q Conversation: core schema (SPEC §5).
-- Enums are text + check constraints so later migrations stay simple.
-- Everything hanging off a participant cascades on delete (SPEC §13).
-- gen_random_uuid() is core Postgres (13+); no extension needed.

-- ---------------------------------------------------------------------------
-- Study id generator: P-0001, P-0002, ...
-- ---------------------------------------------------------------------------
create sequence if not exists public.study_id_seq as integer start with 1 increment by 1;

create or replace function public.next_study_id()
returns text
language sql
volatile
set search_path = public
as $$
  select 'P-' || lpad(nextval('public.study_id_seq')::text, 4, '0');
$$;

comment on function public.next_study_id() is
  'Pseudonymous study id (P-0001, P-0002, ...). Only ever called server-side.';

-- ---------------------------------------------------------------------------
-- Clinicians (keyed to Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.clinicians (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.clinicians is
  'Presence of a row grants clinician access (magic-link auth users only).';

-- ---------------------------------------------------------------------------
-- Instruments
-- ---------------------------------------------------------------------------
create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  version text not null,
  publisher text not null,
  license_notes text not null,
  license_url text,
  item_text_stored boolean not null default false,
  created_at timestamptz not null default now(),
  constraint instruments_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint instruments_license_notes_present check (length(btrim(license_notes)) > 0)
);

-- ---------------------------------------------------------------------------
-- Construct maps
-- ---------------------------------------------------------------------------
create table public.construct_maps (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version integer not null,
  population text not null,
  source_instrument_ids uuid[] not null default '{}',
  map jsonb not null,
  status text not null default 'draft',
  approved_by uuid references public.clinicians (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint construct_maps_slug_version_unique unique (slug, version),
  constraint construct_maps_version_positive check (version > 0),
  constraint construct_maps_population_check check (population in ('adult', 'pediatric')),
  constraint construct_maps_status_check check (status in ('draft', 'approved', 'retired')),
  constraint construct_maps_map_is_object check (jsonb_typeof(map) = 'object'),
  constraint construct_maps_approval_consistent check (
    status <> 'approved' or approved_at is not null
  )
);

create index construct_maps_approved_by_idx on public.construct_maps (approved_by);
create index construct_maps_slug_status_idx on public.construct_maps (slug, status);

-- ---------------------------------------------------------------------------
-- Diagnosis catalog
-- ---------------------------------------------------------------------------
create table public.diagnosis_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_en text not null,
  label_es text not null,
  module text not null,
  default_map_slug_adult text not null,
  default_map_slug_pediatric text not null,
  focus_constructs text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint diagnosis_catalog_code_format check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint diagnosis_catalog_module_check check (
    module in ('aesthetics', 'craniofacial', 'head-neck-cancer', 'skin-cancer')
  )
);

-- ---------------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------------
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  study_id text not null unique default public.next_study_id(),
  display_name text not null,
  preferred_language text not null default 'en',
  age_band text not null,
  reading_comfort text not null default 'comfortable',
  diagnosis_code text not null references public.diagnosis_catalog (code),
  diagnosis_text text,
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint participants_preferred_language_check check (preferred_language in ('en', 'es')),
  constraint participants_age_band_check check (
    age_band in ('under-8', '8-12', '13-17', '18-29', '30-49', '50-69', '70-plus')
  ),
  constraint participants_reading_comfort_check check (
    reading_comfort in ('short-messages', 'comfortable', 'prefer-voice')
  )
);

create index participants_diagnosis_code_idx on public.participants (diagnosis_code);
create index participants_is_demo_idx on public.participants (is_demo) where is_demo;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  timepoint text not null,
  respondent text not null default 'self',
  language text not null,
  construct_map_id uuid not null references public.construct_maps (id),
  prompt_version text not null,
  model_id text not null,
  status text not null default 'intake',
  resume_token_hash text not null,
  max_turns integer not null default 40,
  target_minutes integer not null default 12,
  started_at timestamptz,
  ended_at timestamptz,
  consent_given_at timestamptz,
  consent_variant text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd_estimate numeric,
  created_at timestamptz not null default now(),
  constraint sessions_timepoint_check check (
    timepoint in ('baseline', 'pre-op', 'post-op-2w', 'post-op-6w', 'post-op-6m', 'post-op-12m', 'follow-up')
  ),
  constraint sessions_respondent_check check (respondent in ('self', 'guardian', 'both')),
  constraint sessions_language_check check (language in ('en', 'es')),
  constraint sessions_status_check check (
    status in ('intake', 'consented', 'active', 'wrapping-up', 'summary-review', 'completed', 'abandoned', 'safety-halted')
  ),
  constraint sessions_consent_variant_check check (
    consent_variant is null or consent_variant in ('adult', 'minor-assent', 'guardian')
  ),
  constraint sessions_resume_token_hash_format check (resume_token_hash ~ '^[0-9a-f]{64}$'),
  constraint sessions_max_turns_positive check (max_turns > 0),
  constraint sessions_target_minutes_positive check (target_minutes > 0),
  constraint sessions_tokens_nonnegative check (input_tokens >= 0 and output_tokens >= 0)
);

create index sessions_participant_id_idx on public.sessions (participant_id);
create index sessions_construct_map_id_idx on public.sessions (construct_map_id);
create index sessions_resume_token_hash_idx on public.sessions (resume_token_hash);
create index sessions_status_idx on public.sessions (status);

-- ---------------------------------------------------------------------------
-- Clinician notes (focus notes for a session)
-- ---------------------------------------------------------------------------
create table public.clinician_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  clinician_id uuid not null references public.clinicians (id) on delete cascade,
  note text not null default '',
  focus_constructs text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index clinician_notes_session_id_idx on public.clinician_notes (session_id);
create index clinician_notes_clinician_id_idx on public.clinician_notes (clinician_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  seq integer not null,
  role text not null,
  content text not null,
  input_mode text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  created_at timestamptz not null default now(),
  constraint messages_session_seq_unique unique (session_id, seq),
  constraint messages_seq_nonnegative check (seq >= 0),
  constraint messages_role_check check (role in ('patient', 'assistant', 'system-event')),
  constraint messages_input_mode_check check (input_mode is null or input_mode in ('text', 'voice')),
  constraint messages_input_mode_patient_only check (input_mode is null or role = 'patient')
);

-- ---------------------------------------------------------------------------
-- Construct evidence
-- ---------------------------------------------------------------------------
create table public.construct_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  construct_id text not null,
  -- Nullable so that patient corrections from confirm-summary (no patient
  -- message row) can still create a superseding evidence row.
  message_id uuid references public.messages (id) on delete cascade,
  patient_quote text not null,
  quote_gloss_en text not null,
  severity text not null,
  confidence numeric not null,
  interference text[] not null default '{}',
  note text,
  superseded_by uuid references public.construct_evidence (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint construct_evidence_severity_check check (
    severity in ('none', 'mild', 'moderate', 'severe', 'unclear', 'declined')
  ),
  constraint construct_evidence_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint construct_evidence_not_self_superseded check (superseded_by is null or superseded_by <> id)
);

create index construct_evidence_session_construct_idx on public.construct_evidence (session_id, construct_id);
create index construct_evidence_message_id_idx on public.construct_evidence (message_id);
create index construct_evidence_superseded_by_idx on public.construct_evidence (superseded_by);

-- ---------------------------------------------------------------------------
-- Probe findings (drill-down)
-- ---------------------------------------------------------------------------
create table public.probe_findings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  construct_id text not null,
  finding text not null,
  category text not null,
  message_id uuid references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint probe_findings_category_check check (
    category in ('onset', 'trajectory', 'triggers', 'relief', 'impact', 'expectation', 'patient_question', 'other')
  )
);

create index probe_findings_session_construct_idx on public.probe_findings (session_id, construct_id);
create index probe_findings_message_id_idx on public.probe_findings (message_id);

-- ---------------------------------------------------------------------------
-- Session profiles (SPEC §8)
-- ---------------------------------------------------------------------------
create table public.session_profiles (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  profile jsonb not null,
  patient_summary text not null default '',
  patient_summary_confirmed_at timestamptz,
  patient_corrections jsonb,
  generated_at timestamptz not null default now(),
  constraint session_profiles_profile_is_object check (jsonb_typeof(profile) = 'object')
);

-- ---------------------------------------------------------------------------
-- Safety flags
-- ---------------------------------------------------------------------------
create table public.safety_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  trigger text not null,
  detected_by text not null,
  action_taken text not null,
  reviewed_by uuid references public.clinicians (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint safety_flags_trigger_check check (trigger in ('self_harm', 'abuse', 'acute_distress', 'other')),
  constraint safety_flags_detected_by_check check (detected_by in ('keyword', 'model'))
);

create index safety_flags_session_id_idx on public.safety_flags (session_id);
create index safety_flags_message_id_idx on public.safety_flags (message_id);
create index safety_flags_reviewed_by_idx on public.safety_flags (reviewed_by);
create index safety_flags_unreviewed_idx on public.safety_flags (session_id) where reviewed_at is null;

-- ---------------------------------------------------------------------------
-- Audit log (append-only; written by edge functions and clinician UI)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_actor_type_check check (actor_type in ('clinician', 'participant', 'system'))
);

create index audit_log_target_idx on public.audit_log (target_type, target_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
