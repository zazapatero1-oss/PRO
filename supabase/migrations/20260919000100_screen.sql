-- Numeric screening (v1.2): ~20 rated items answered before the conversation. The lowest
-- scores become the conversation's focus. Items are our own wording, each tied to a construct.
create table public.screen_items (
  id text primary key,
  population text not null check (population in ('adult', 'pediatric')),
  construct_id text not null,
  domain text not null check (domain in ('facial', 'social', 'function')),
  text_en text not null,
  text_es text not null,
  low_en text not null,
  high_en text not null,
  low_es text not null,
  high_es text not null,
  sort_order int not null,
  active boolean not null default true
);
create index screen_items_population_idx on public.screen_items (population, sort_order);

alter table public.screen_items enable row level security;
create policy screen_items_clinician_select on public.screen_items
  for select to authenticated using (public.is_clinician());
grant select on public.screen_items to authenticated;
grant all privileges on public.screen_items to service_role;

alter table public.sessions
  add column screen_scores jsonb,
  add column screen_completed_at timestamptz;
comment on column public.sessions.screen_scores is
  'Item id → 0–10 rating (10 = best). Null until the patient submits the screen.';
