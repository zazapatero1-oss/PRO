-- v_participant_timeline (SPEC §5 Views / RPC).
-- One row per (participant, session); participants without sessions still
-- appear (session columns null). Ordered by study_id then timepoint order.
-- security_invoker so the clinician RLS policies apply to the underlying tables.

create or replace view public.v_participant_timeline
with (security_invoker = true)
as
with timepoint_order as (
  select *
  from (values
    ('baseline',    10),
    ('pre-op',      20),
    ('post-op-2w',  30),
    ('post-op-6w',  40),
    ('post-op-6m',  50),
    ('post-op-12m', 60),
    ('follow-up',   70)
  ) as t (timepoint, sort_order)
),
session_flags as (
  select
    session_id,
    count(*)::integer                                   as flag_count,
    count(*) filter (where reviewed_at is null)::integer as open_flag_count
  from public.safety_flags
  group by session_id
),
session_turns as (
  select
    session_id,
    count(*) filter (where role = 'assistant')::integer as assistant_turns,
    count(*) filter (where role = 'patient')::integer   as patient_turns
  from public.messages
  group by session_id
)
select
  p.id                          as participant_id,
  p.study_id,
  p.display_name,
  p.preferred_language,
  p.age_band,
  p.reading_comfort,
  p.diagnosis_code,
  d.label_en                    as diagnosis_label_en,
  d.label_es                    as diagnosis_label_es,
  d.module                      as diagnosis_module,
  p.is_demo,
  p.created_at                  as participant_created_at,
  s.id                          as session_id,
  s.timepoint,
  tpo.sort_order                as timepoint_order,
  s.respondent,
  s.language,
  s.status                      as session_status,
  s.construct_map_id,
  cm.slug                       as construct_map_slug,
  cm.version                    as construct_map_version,
  s.prompt_version,
  s.model_id,
  s.started_at,
  s.ended_at,
  s.consent_given_at,
  s.consent_variant,
  s.input_tokens,
  s.output_tokens,
  s.cost_usd_estimate,
  coalesce(st.assistant_turns, 0) as assistant_turns,
  coalesce(st.patient_turns, 0)   as patient_turns,
  coalesce(sf.flag_count, 0)      as flag_count,
  coalesce(sf.open_flag_count, 0) as open_flag_count,
  sp.generated_at               as profile_generated_at,
  sp.patient_summary_confirmed_at,
  -- Compact per-domain severity summary for list/change views; full profile
  -- stays in session_profiles.
  (
    select jsonb_agg(
      jsonb_build_object(
        'id',         dom.value ->> 'id',
        'label',      dom.value ->> 'label',
        'severity',   dom.value ->> 'severity',
        'confidence', dom.value -> 'confidence'
      )
      order by dom.ordinality
    )
    from jsonb_array_elements(coalesce(sp.profile -> 'domains', '[]'::jsonb))
      with ordinality as dom (value, ordinality)
  )                             as profile_summary,
  coalesce(jsonb_array_length(sp.profile -> 'needs_clarification'), 0) as needs_clarification_count,
  coalesce(jsonb_array_length(sp.profile -> 'declined'), 0)            as declined_count,
  coalesce(jsonb_array_length(sp.profile -> 'not_covered'), 0)         as not_covered_count,
  coalesce(jsonb_array_length(sp.profile -> 'patient_questions'), 0)   as patient_question_count
from public.participants p
join public.diagnosis_catalog d on d.code = p.diagnosis_code
left join public.sessions s on s.participant_id = p.id
left join timepoint_order tpo on tpo.timepoint = s.timepoint
left join public.construct_maps cm on cm.id = s.construct_map_id
left join public.session_profiles sp on sp.session_id = s.id
left join session_flags sf on sf.session_id = s.id
left join session_turns st on st.session_id = s.id
where p.deleted_at is null
order by p.study_id, tpo.sort_order nulls last, s.started_at nulls last, s.created_at;

comment on view public.v_participant_timeline is
  'Participant timeline for the clinician list and change view. Soft-deleted participants are excluded.';

revoke all on public.v_participant_timeline from anon;
grant select on public.v_participant_timeline to authenticated, service_role;
