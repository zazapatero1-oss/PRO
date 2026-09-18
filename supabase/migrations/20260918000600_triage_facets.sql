-- SPEC v1.1 §D: triage phase, focus constructs and per-facet evidence.
--
-- Evidence rows now say which facets of a construct they speak to, and which
-- triage item (if any) they answered, so the tracker can measure depth rather
-- than mere coverage. Sessions carry the phase they are in and the focus set the
-- tracker derived at the end of triage.

-- ---------------------------------------------------------------------------
-- construct_evidence
-- ---------------------------------------------------------------------------
alter table public.construct_evidence
  add column facets text[] not null default '{}',
  add column triage_item text;

comment on column public.construct_evidence.facets is
  'Facet ids from the construct''s facets list in the map (SPEC v1.1 §A). Drives focus_facet_threshold.';
comment on column public.construct_evidence.triage_item is
  'Triage item id this evidence answered, when it came from the opening screen (SPEC v1.1 §B).';

-- Facet progress is read per session+construct, which the existing
-- (session_id, construct_id) index already serves; triage progress is read per
-- session across constructs, so it gets its own partial index.
create index construct_evidence_triage_item_idx
  on public.construct_evidence (session_id, triage_item)
  where triage_item is not null;

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column phase text not null default 'triage',
  add column focus_constructs text[] not null default '{}',
  add constraint sessions_phase_check check (phase in ('triage', 'explore', 'wrap-up'));

comment on column public.sessions.phase is
  'Conversation phase (SPEC v1.1 §B). Derived by the tracker each turn, not trusted to the model.';
comment on column public.sessions.focus_constructs is
  'Constructs the tracker derived from triage (plus clinician focus). Capped at 8; everything else is a light pass.';

-- Deeper sessions need more room than v1 allowed (SPEC v1.1 §B). Defaults only:
-- existing rows keep the budget they were created with.
alter table public.sessions
  alter column max_turns set default 60,
  alter column target_minutes set default 20;
