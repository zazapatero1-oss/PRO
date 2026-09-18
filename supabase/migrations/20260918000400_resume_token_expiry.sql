-- Patient session links expire (SPEC §4). Existing rows get 14 days from now.
alter table public.sessions
  add column resume_token_expires_at timestamptz not null default (now() + interval '14 days');

comment on column public.sessions.resume_token_expires_at is
  'Resume token is rejected after this instant. Set by start-session; default covers direct inserts.';
