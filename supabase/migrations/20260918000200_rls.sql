-- Row level security (SPEC §4 Auth/RLS).
--
-- Model:
--   * anon            -> no table access at all (patients only ever reach the DB
--                        through edge functions running as service role).
--   * authenticated   -> read everything IF the user has a row in clinicians;
--                        may insert clinician_notes and audit_log rows as itself.
--   * service_role    -> bypasses RLS (Supabase default); used by edge functions.

-- ---------------------------------------------------------------------------
-- Helper: is the current JWT subject a registered clinician?
-- security definer so the check works even though clinicians itself is RLS-gated.
-- ---------------------------------------------------------------------------
create or replace function public.is_clinician()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinicians c
    where c.id = auth.uid()
  );
$$;

revoke all on function public.is_clinician() from public;
grant execute on function public.is_clinician() to authenticated, service_role;

-- next_study_id is server-side only.
revoke all on function public.next_study_id() from public, anon, authenticated;
grant execute on function public.next_study_id() to service_role;
revoke all on sequence public.study_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.clinicians          enable row level security;
alter table public.instruments         enable row level security;
alter table public.construct_maps      enable row level security;
alter table public.diagnosis_catalog   enable row level security;
alter table public.participants        enable row level security;
alter table public.sessions            enable row level security;
alter table public.clinician_notes     enable row level security;
alter table public.messages            enable row level security;
alter table public.construct_evidence  enable row level security;
alter table public.probe_findings      enable row level security;
alter table public.session_profiles    enable row level security;
alter table public.safety_flags        enable row level security;
alter table public.audit_log           enable row level security;

-- ---------------------------------------------------------------------------
-- Grants. Supabase's default privileges give anon/authenticated broad table
-- access; tighten so that RLS policies are the only path.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on
  public.clinicians,
  public.instruments,
  public.construct_maps,
  public.diagnosis_catalog,
  public.participants,
  public.sessions,
  public.clinician_notes,
  public.messages,
  public.construct_evidence,
  public.probe_findings,
  public.session_profiles,
  public.safety_flags,
  public.audit_log
to authenticated;

grant insert on public.clinician_notes, public.audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- Read policies: every table, clinicians only
-- ---------------------------------------------------------------------------
create policy clinicians_select on public.clinicians
  for select to authenticated using (public.is_clinician());

create policy instruments_select on public.instruments
  for select to authenticated using (public.is_clinician());

create policy construct_maps_select on public.construct_maps
  for select to authenticated using (public.is_clinician());

create policy diagnosis_catalog_select on public.diagnosis_catalog
  for select to authenticated using (public.is_clinician());

create policy participants_select on public.participants
  for select to authenticated using (public.is_clinician());

create policy sessions_select on public.sessions
  for select to authenticated using (public.is_clinician());

create policy clinician_notes_select on public.clinician_notes
  for select to authenticated using (public.is_clinician());

create policy messages_select on public.messages
  for select to authenticated using (public.is_clinician());

create policy construct_evidence_select on public.construct_evidence
  for select to authenticated using (public.is_clinician());

create policy probe_findings_select on public.probe_findings
  for select to authenticated using (public.is_clinician());

create policy session_profiles_select on public.session_profiles
  for select to authenticated using (public.is_clinician());

create policy safety_flags_select on public.safety_flags
  for select to authenticated using (public.is_clinician());

create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_clinician());

-- ---------------------------------------------------------------------------
-- Write policies: clinicians may add notes and audit rows attributed to themselves.
-- All other writes come from edge functions (service role).
-- ---------------------------------------------------------------------------
create policy clinician_notes_insert on public.clinician_notes
  for insert to authenticated
  with check (public.is_clinician() and clinician_id = auth.uid());

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (
    public.is_clinician()
    and actor_type = 'clinician'
    and actor_id = auth.uid()::text
  );
