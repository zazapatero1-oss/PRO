-- Clinicians pick domains of interest for a session (v1.3) instead of individual constructs.
-- The engine explores the patient's lowest-rated areas inside these domains first.
alter table public.clinician_notes
  add column focus_domains text[] not null default '{}';

comment on column public.clinician_notes.focus_domains is
  'Construct-map domain ids the clinician wants this session to go deeper on.';
