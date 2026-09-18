-- Demo mode fixtures (SPEC §13). Three synthetic, pseudonymous participants
-- with completed sessions, messages, evidence, drill-down findings and
-- inferred profiles. No PHI, no safety flags, no instrument item text.
--
-- Requires seed.sql (construct maps + diagnosis catalog) to be loaded first.
-- Re-runnable: existing demo rows with these ids are removed (cascade) first.
--
-- Conventions for fixed ids (all under the d3a0c00x prefix):
--   participants  d3a0c001-0000-4000-8000-00000000000P
--   sessions      d3a0c002-0000-4000-8000-00000000000S
--   messages      d3a0c003-000S-4000-8000-0000000000NN   (S = session, NN = seq)
--   evidence      d3a0c004-000S-4000-8000-0000000000NN
--   findings      d3a0c005-000S-4000-8000-0000000000NN
-- resume_token_hash values are sha256 digests of throw-away strings; the
-- sessions are completed so nothing can be resumed with them.

begin;

delete from public.participants
where id in (
  'd3a0c001-0000-4000-8000-000000000001',
  'd3a0c001-0000-4000-8000-000000000002',
  'd3a0c001-0000-4000-8000-000000000003'
);

-- ===========================================================================
-- Participants (study_id comes from next_study_id())
-- ===========================================================================
insert into public.participants
  (id, display_name, preferred_language, age_band, reading_comfort, diagnosis_code, diagnosis_text, is_demo, created_at)
values
  ('d3a0c001-0000-4000-8000-000000000001', 'Jordan',  'en', '30-49', 'comfortable',    'rhinoplasty',      'Rhinoplasty after old sports injury; cosmetic and breathing', true, '2026-07-18 09:12:00+00'),
  ('d3a0c001-0000-4000-8000-000000000002', 'Marisol', 'es', '50-69', 'comfortable',    'facelift',         'Lifting facial y cuello', true, '2026-08-10 10:05:00+00'),
  ('d3a0c001-0000-4000-8000-000000000003', 'Sam',     'en', '8-12',  'short-messages', 'cleft-lip-palate', 'Unilateral cleft lip and palate, repaired in infancy; lip revision planned', true, '2026-08-24 14:40:00+00');

-- ===========================================================================
-- Sessions
-- ===========================================================================
insert into public.sessions
  (id, participant_id, timepoint, respondent, language, construct_map_id, prompt_version, model_id, status,
   resume_token_hash, max_turns, target_minutes, phase, focus_constructs,
   started_at, ended_at, consent_given_at, consent_variant,
   input_tokens, output_tokens, cost_usd_estimate, created_at)
values
  ('d3a0c002-0000-4000-8000-000000000001', 'd3a0c001-0000-4000-8000-000000000001', 'baseline',   'self',     'en',
   (select id from public.construct_maps where slug = 'face-q-adult' and status = 'approved'
    order by version desc limit 1),
   'demo-seed-1', 'claude-sonnet-5', 'completed',
   '9d585b8e94db3393f4fd68bb63a07295e91f845430803bd9f4e48a9f0ca66d9b', 40, 12, 'wrap-up',
   array['appearance.nose', 'function.breathing', 'adverse.asymmetry', 'distress.preoccupation', 'appearance.overall', 'psych.self_confidence', 'social.avoidance', 'psych.mood']::text[],
   '2026-07-20 18:02:00+00', '2026-07-20 18:15:30+00', '2026-07-20 18:01:10+00', 'adult',
   38420, 2610, 0.154, '2026-07-18 09:12:30+00'),
  ('d3a0c002-0000-4000-8000-000000000002', 'd3a0c001-0000-4000-8000-000000000001', 'post-op-6w', 'self',     'en',
   (select id from public.construct_maps where slug = 'face-q-adult' and status = 'approved'
    order by version desc limit 1),
   'demo-seed-1', 'claude-sonnet-5', 'completed',
   'bcb09d04aa1ea8d3c0f1012dbcd7eba312593c8b553c8a118b2d4225d49c3844', 40, 12, 'wrap-up',
   array['adverse.numbness_sensation', 'outcome.information', 'adverse.swelling_bruising', 'function.facial_expression', 'distress.preoccupation']::text[],
   '2026-09-08 19:30:00+00', '2026-09-08 19:41:45+00', '2026-09-08 19:29:20+00', 'adult',
   41880, 2490, 0.163, '2026-09-06 08:00:00+00'),
  ('d3a0c002-0000-4000-8000-000000000003', 'd3a0c001-0000-4000-8000-000000000002', 'baseline',   'self',     'es',
   (select id from public.construct_maps where slug = 'face-q-adult' and status = 'approved'
    order by version desc limit 1),
   'demo-seed-1', 'claude-sonnet-5', 'completed',
   'b1d0eb4139476fb2910d52f9e7008798bfd7fdf62dbfdd163ff3c211474506b0', 40, 12, 'wrap-up',
   array['appearance.overall', 'aging.appraisal', 'appearance.chin_jawline', 'appearance.cheeks', 'social.avoidance', 'social.comfort', 'psych.self_confidence', 'distress.preoccupation']::text[],
   '2026-08-12 16:10:00+00', '2026-08-12 16:24:10+00', '2026-08-12 16:09:05+00', 'adult',
   40150, 2880, 0.161, '2026-08-10 10:06:00+00'),
  ('d3a0c002-0000-4000-8000-000000000004', 'd3a0c001-0000-4000-8000-000000000003', 'baseline',   'guardian', 'en',
   (select id from public.construct_maps where slug = 'face-q-pediatric' and status = 'approved'
    order by version desc limit 1),
   'demo-seed-1', 'claude-sonnet-5', 'completed',
   'b6b50a806860bfe6b627a659be13b268953d0a47b28a083a28f5d20e6b7370fc', 40, 12, 'wrap-up',
   array['appearance.lips', 'social.teasing_comments', 'function.speaking', 'social.avoidance', 'appearance.overall', 'psych.self_confidence', 'social.school', 'distress.preoccupation']::text[],
   '2026-08-26 17:00:00+00', '2026-08-26 17:12:20+00', '2026-08-26 16:59:00+00', 'guardian',
   36900, 2410, 0.148, '2026-08-24 14:41:00+00');

-- ===========================================================================
-- Session 1: Jordan, baseline, rhinoplasty (en)
-- ===========================================================================
insert into public.messages (id, session_id, seq, role, content, input_mode, tokens_in, tokens_out, latency_ms, created_at) values
  ('d3a0c003-0001-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000001', 1, 'assistant',
   $d$Hi Jordan, thanks for making the time. I'm here to understand how things are for you before your surgery: how you feel about your face, day-to-day stuff, anything on your mind. There are no right answers, and you can skip anything. To start, what made you decide to look into having your nose operated on?$d$,
   null, 4120, 96, 2210, '2026-07-20 18:02:05+00'),
  ('d3a0c003-0001-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000001', 2, 'patient',
   $d$Honestly it's been a long time coming. I broke it playing football in my twenties and it's had a bump and been crooked ever since. I hate the way it looks in photos, especially from the side. And I can't breathe properly through the left side.$d$,
   'text', null, null, null, '2026-07-20 18:03:10+00'),
  ('d3a0c003-0001-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000001', 3, 'assistant',
   $d$That's two things at once, how it looks and how it breathes. Let's take the photos first. When you say you hate it from the side, how does that play out? Do you find yourself avoiding photos, or is it more that you notice it afterwards?$d$,
   null, 4390, 71, 1980, '2026-07-20 18:03:14+00'),
  ('d3a0c003-0001-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000001', 4, 'patient',
   $d$Both. If someone's taking a group photo I'll angle myself so they get me straight on. I've deleted a lot of pictures of myself. It's not that I think I'm ugly, it's just that bump is all I see.$d$,
   'text', null, null, null, '2026-07-20 18:04:22+00'),
  ('d3a0c003-0001-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000001', 5, 'assistant',
   $d$So it's less about your face overall and very much about that one feature. How long has it been bothering you like this? Was it right after the injury, or did it build up?$d$,
   null, 4610, 52, 1750, '2026-07-20 18:04:26+00'),
  ('d3a0c003-0001-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000001', 6, 'patient',
   $d$It built up. For years I just ignored it. Then a few years ago I started a job where I'm on video calls all day, and seeing myself constantly made it worse. Now I think about it most days.$d$,
   'voice', null, null, null, '2026-07-20 18:05:40+00'),
  ('d3a0c003-0001-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000001', 7, 'assistant',
   $d$That makes sense. Being on camera all day is a lot of mirror time. You said you think about it most days; does it get in the way of anything, like joining calls or going out?$d$,
   null, 4830, 55, 1820, '2026-07-20 18:05:44+00'),
  ('d3a0c003-0001-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000001', 8, 'patient',
   $d$Not going out, no. I still see friends and do everything I want. I'd say it knocks my confidence on calls a bit, I keep my camera off more than I should. But it's not ruining my life or anything.$d$,
   'text', null, null, null, '2026-07-20 18:06:55+00'),
  ('d3a0c003-0001-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000001', 9, 'assistant',
   $d$Good to know. I've noted that it's about confidence on camera rather than stopping you from doing things. Let's talk about the breathing. You said the left side is blocked. What's that like day to day, and at night?$d$,
   null, 5070, 63, 1900, '2026-07-20 18:06:59+00'),
  ('d3a0c003-0001-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000001', 10, 'patient',
   $d$During the day it's fine unless I've got a cold. At night it's bad. I wake up with a dry mouth most mornings and my partner says I snore. When I run I definitely feel I'm breathing through my mouth more than I should.$d$,
   'text', null, null, null, '2026-07-20 18:08:12+00'),
  ('d3a0c003-0001-4000-8000-000000000011', 'd3a0c002-0000-4000-8000-000000000001', 11, 'assistant',
   $d$So it's mainly nights and exercise. One more thing on that: have you tried anything for it, like nasal strips or sprays, and did they help?$d$,
   null, 5310, 44, 1640, '2026-07-20 18:08:16+00'),
  ('d3a0c003-0001-4000-8000-000000000012', 'd3a0c002-0000-4000-8000-000000000001', 12, 'patient',
   $d$Strips help a bit for sleeping. Sprays not really.$d$,
   'text', null, null, null, '2026-07-20 18:08:50+00'),
  ('d3a0c003-0001-4000-8000-000000000013', 'd3a0c002-0000-4000-8000-000000000001', 13, 'assistant',
   $d$Thanks. Last area for today: how are you feeling about the surgery itself? What are you hoping will be different afterwards, and is there anything you're worried about?$d$,
   null, 5480, 49, 1710, '2026-07-20 18:08:54+00'),
  ('d3a0c003-0001-4000-8000-000000000014', 'd3a0c002-0000-4000-8000-000000000001', 14, 'patient',
   $d$I want a straight nose that doesn't have a bump, and to breathe on both sides. I'm a bit nervous about it looking 'done', I want it to still look like my nose. Is it normal to worry about that? Also I'm not looking forward to the bruising.$d$,
   'text', null, null, null, '2026-07-20 18:10:30+00'),
  ('d3a0c003-0001-4000-8000-000000000015', 'd3a0c002-0000-4000-8000-000000000001', 15, 'assistant',
   $d$Wanting it to still look like you is something a lot of people say, and it's a good thing to raise with your surgeon. I'll make sure that question is passed on to your care team rather than answer it myself. I've noted the bump and crookedness, the camera-confidence piece, the left-side blockage at night and when running, and your hope for a natural, straight result with easier breathing. Did I get this right? You can correct anything in the summary I'll show you next.$d$,
   null, 5790, 118, 2460, '2026-07-20 18:10:36+00'),
  ('d3a0c003-0001-4000-8000-000000000016', 'd3a0c002-0000-4000-8000-000000000001', 16, 'patient',
   $d$Yeah that's it.$d$,
   'text', null, null, null, '2026-07-20 18:11:02+00');

insert into public.construct_evidence (id, session_id, construct_id, message_id, patient_quote, quote_gloss_en, severity, confidence, interference, note, created_at) values
  ('d3a0c004-0001-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000001', 'appearance.nose', 'd3a0c003-0001-4000-8000-000000000002',
   $d$I hate the way it looks in photos, especially from the side.$d$, $d$I hate the way it looks in photos, especially from the side.$d$,
   'moderate', 0.85, '{}', 'Strong dissatisfaction focused on profile; long-standing.', '2026-07-20 18:03:12+00'),
  ('d3a0c004-0001-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000001', 'adverse.asymmetry', 'd3a0c003-0001-4000-8000-000000000002',
   $d$it's had a bump and been crooked ever since$d$, $d$it's had a bump and been crooked ever since$d$,
   'moderate', 0.70, '{}', 'Perceived deviation since injury; pre-operative.', '2026-07-20 18:03:12+00'),
  ('d3a0c004-0001-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000001', 'function.breathing', 'd3a0c003-0001-4000-8000-000000000002',
   $d$I can't breathe properly through the left side.$d$, $d$I can't breathe properly through the left side.$d$,
   'moderate', 0.70, '{}', 'Unilateral obstruction mentioned spontaneously; detail gathered later.', '2026-07-20 18:03:12+00'),
  ('d3a0c004-0001-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000001', 'social.avoidance', 'd3a0c003-0001-4000-8000-000000000004',
   $d$If someone's taking a group photo I'll angle myself so they get me straight on. I've deleted a lot of pictures of myself.$d$, $d$If someone's taking a group photo I'll angle myself so they get me straight on. I've deleted a lot of pictures of myself.$d$,
   'mild', 0.75, '{social}', 'Photo-specific avoidance; not avoiding events.', '2026-07-20 18:04:24+00'),
  ('d3a0c004-0001-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000001', 'appearance.overall', 'd3a0c003-0001-4000-8000-000000000004',
   $d$It's not that I think I'm ugly, it's just that bump is all I see.$d$, $d$It's not that I think I'm ugly, it's just that bump is all I see.$d$,
   'mild', 0.80, '{}', 'Overall appearance acceptable; concern localised to the nose.', '2026-07-20 18:04:24+00'),
  ('d3a0c004-0001-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000001', 'distress.preoccupation', 'd3a0c003-0001-4000-8000-000000000006',
   $d$Now I think about it most days.$d$, $d$Now I think about it most days.$d$,
   'moderate', 0.80, '{work}', 'Daily thoughts, escalated by constant self-view on video calls.', '2026-07-20 18:05:42+00'),
  ('d3a0c004-0001-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000001', 'psych.self_confidence', 'd3a0c003-0001-4000-8000-000000000008',
   $d$I'd say it knocks my confidence on calls a bit, I keep my camera off more than I should.$d$, $d$I'd say it knocks my confidence on calls a bit, I keep my camera off more than I should.$d$,
   'mild', 0.80, '{work}', 'Situational, work-related dip in confidence.', '2026-07-20 18:06:57+00'),
  ('d3a0c004-0001-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000001', 'social.comfort', 'd3a0c003-0001-4000-8000-000000000008',
   $d$I still see friends and do everything I want.$d$, $d$I still see friends and do everything I want.$d$,
   'none', 0.80, '{}', 'Social life reported as unaffected.', '2026-07-20 18:06:57+00'),
  ('d3a0c004-0001-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000001', 'psych.mood', 'd3a0c003-0001-4000-8000-000000000008',
   $d$But it's not ruining my life or anything.$d$, $d$But it's not ruining my life or anything.$d$,
   'mild', 0.50, '{}', 'Mood not asked directly; inferred from minimising statement. Needs clarification.', '2026-07-20 18:06:57+00'),
  ('d3a0c004-0001-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000001', 'function.breathing', 'd3a0c003-0001-4000-8000-000000000010',
   $d$At night it's bad. I wake up with a dry mouth most mornings and my partner says I snore.$d$, $d$At night it's bad. I wake up with a dry mouth most mornings and my partner says I snore.$d$,
   'moderate', 0.85, '{sleep,daily-activities}', 'Nocturnal obstruction with mouth breathing and snoring; also affects running.', '2026-07-20 18:08:14+00');

insert into public.probe_findings (id, session_id, construct_id, finding, category, message_id, created_at) values
  ('d3a0c005-0001-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000001', 'appearance.nose',
   'Bump and deviation date from a sports injury in their twenties; became a daily concern a few years ago after starting a job with all-day video calls.', 'onset', 'd3a0c003-0001-4000-8000-000000000006', '2026-07-20 18:05:42+00'),
  ('d3a0c005-0001-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000001', 'appearance.nose',
   'Worst in side-profile photos and on video calls; angles themselves straight-on in group photos and has deleted many pictures.', 'triggers', 'd3a0c003-0001-4000-8000-000000000004', '2026-07-20 18:04:24+00'),
  ('d3a0c005-0001-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000001', 'function.breathing',
   'Left-sided blockage mainly at night (dry mouth on waking, partner reports snoring) and when running; fine by day unless they have a cold.', 'impact', 'd3a0c003-0001-4000-8000-000000000010', '2026-07-20 18:08:14+00'),
  ('d3a0c005-0001-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000001', 'function.breathing',
   'Nasal strips help a little for sleeping; sprays did not help.', 'relief', 'd3a0c003-0001-4000-8000-000000000012', '2026-07-20 18:08:52+00'),
  ('d3a0c005-0001-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000001', 'appearance.nose',
   'Hopes for a straight nose without the bump that still looks like their own nose, and to breathe through both sides.', 'expectation', 'd3a0c003-0001-4000-8000-000000000014', '2026-07-20 18:10:32+00'),
  ('d3a0c005-0001-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000001', 'appearance.nose',
   'Asked whether it is normal to worry that the result will look "done". Not answered clinically; passed to care team.', 'patient_question', 'd3a0c003-0001-4000-8000-000000000014', '2026-07-20 18:10:32+00'),
  ('d3a0c005-0001-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000001', 'adverse.swelling_bruising',
   'Anticipates and is not looking forward to post-operative bruising.', 'expectation', 'd3a0c003-0001-4000-8000-000000000014', '2026-07-20 18:10:32+00');

insert into public.session_profiles (session_id, profile, patient_summary, patient_summary_confirmed_at, patient_corrections, generated_at) values
  ('d3a0c002-0000-4000-8000-000000000001',
   $d${
  "generated_with": {"model": "claude-sonnet-5", "prompt_version": "demo-seed-1", "map": "face-q-adult@2"},
  "domains": [
    {
      "id": "appearance", "label": "Satisfaction with facial appearance",
      "severity": "moderate", "confidence": 0.82,
      "summary_en": "Dissatisfaction is focused on the nose (bump and deviation from an old injury), especially in profile and on video. Overall facial appearance is otherwise acceptable to them.",
      "constructs": [
        {"id": "appearance.nose", "severity": "moderate", "confidence": 0.85,
         "quotes": [{"text": "I hate the way it looks in photos, especially from the side.", "lang": "en", "gloss_en": "I hate the way it looks in photos, especially from the side."}],
         "findings": [
           {"category": "onset", "text": "Bump and deviation date from a sports injury in their twenties; became a daily concern a few years ago after starting a job with all-day video calls."},
           {"category": "triggers", "text": "Worst in side-profile photos and on video calls; angles themselves straight-on in group photos and has deleted many pictures."},
           {"category": "expectation", "text": "Hopes for a straight nose without the bump that still looks like their own nose, and to breathe through both sides."}
         ],
         "status": "drill_down_done"},
        {"id": "appearance.overall", "severity": "mild", "confidence": 0.80,
         "quotes": [{"text": "It's not that I think I'm ugly, it's just that bump is all I see.", "lang": "en", "gloss_en": "It's not that I think I'm ugly, it's just that bump is all I see."}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "psychological", "label": "Psychological function",
      "severity": "mild", "confidence": 0.65,
      "summary_en": "Confidence dips on video calls at work (keeps camera off). Mood was not explored directly; the patient minimised impact, so this needs clarification.",
      "constructs": [
        {"id": "psych.self_confidence", "severity": "mild", "confidence": 0.80,
         "quotes": [{"text": "I'd say it knocks my confidence on calls a bit, I keep my camera off more than I should.", "lang": "en", "gloss_en": "I'd say it knocks my confidence on calls a bit, I keep my camera off more than I should."}],
         "findings": [], "status": "covered"},
        {"id": "psych.mood", "severity": "mild", "confidence": 0.50,
         "quotes": [{"text": "But it's not ruining my life or anything.", "lang": "en", "gloss_en": "But it's not ruining my life or anything."}],
         "findings": [], "status": "needs_clarification"}
      ]
    },
    {
      "id": "social", "label": "Social function",
      "severity": "mild", "confidence": 0.78,
      "summary_en": "Social life is intact; avoidance is limited to photos (angling, deleting pictures).",
      "constructs": [
        {"id": "social.comfort", "severity": "none", "confidence": 0.80,
         "quotes": [{"text": "I still see friends and do everything I want.", "lang": "en", "gloss_en": "I still see friends and do everything I want."}],
         "findings": [], "status": "covered"},
        {"id": "social.avoidance", "severity": "mild", "confidence": 0.75,
         "quotes": [{"text": "If someone's taking a group photo I'll angle myself so they get me straight on. I've deleted a lot of pictures of myself.", "lang": "en", "gloss_en": "If someone's taking a group photo I'll angle myself so they get me straight on. I've deleted a lot of pictures of myself."}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "distress", "label": "Appearance-related distress",
      "severity": "moderate", "confidence": 0.80,
      "summary_en": "Thinks about the nose most days, driven by constant self-view on video calls. Concealment was not discussed.",
      "constructs": [
        {"id": "distress.preoccupation", "severity": "moderate", "confidence": 0.80,
         "quotes": [{"text": "Now I think about it most days.", "lang": "en", "gloss_en": "Now I think about it most days."}],
         "findings": [], "status": "drill_down_pending"}
      ]
    },
    {
      "id": "function", "label": "Facial function",
      "severity": "moderate", "confidence": 0.85,
      "summary_en": "Left-sided nasal obstruction, worst at night (dry mouth, snoring) and when running. Nasal strips help a little; sprays do not.",
      "constructs": [
        {"id": "function.breathing", "severity": "moderate", "confidence": 0.85,
         "quotes": [
           {"text": "I can't breathe properly through the left side.", "lang": "en", "gloss_en": "I can't breathe properly through the left side."},
           {"text": "At night it's bad. I wake up with a dry mouth most mornings and my partner says I snore.", "lang": "en", "gloss_en": "At night it's bad. I wake up with a dry mouth most mornings and my partner says I snore."}
         ],
         "findings": [
           {"category": "impact", "text": "Left-sided blockage mainly at night (dry mouth on waking, partner reports snoring) and when running; fine by day unless they have a cold."},
           {"category": "relief", "text": "Nasal strips help a little for sleeping; sprays did not help."}
         ],
         "status": "drill_down_done"}
      ]
    },
    {
      "id": "adverse", "label": "Adverse effects and symptoms",
      "severity": "moderate", "confidence": 0.70,
      "summary_en": "Pre-operative: perceived deviation of the nose since the injury. No pain, swelling or numbness discussed.",
      "constructs": [
        {"id": "adverse.asymmetry", "severity": "moderate", "confidence": 0.70,
         "quotes": [{"text": "it's had a bump and been crooked ever since", "lang": "en", "gloss_en": "it's had a bump and been crooked ever since"}],
         "findings": [], "status": "covered"},
        {"id": "adverse.swelling_bruising", "severity": "unclear", "confidence": 0.0,
         "quotes": [],
         "findings": [{"category": "expectation", "text": "Anticipates and is not looking forward to post-operative bruising."}],
         "status": "untouched"}
      ]
    }
  ],
  "needs_clarification": [
    {"construct_id": "psych.mood", "reason": "Only a minimising statement; mood not asked about directly."}
  ],
  "not_covered": ["distress.hiding", "adverse.pain_discomfort", "adverse.swelling_bruising", "adverse.numbness_sensation"],
  "declined": [],
  "patient_questions": ["Is it normal to worry that the result will look 'done' rather than natural?"],
  "change_from_prior": [],
  "disclaimer": "AI-assisted inferred profile. Not a validated FACE-Q score."
}$d$::jsonb,
   $d$Here is what I heard today:
- Your nose: the bump and the crookedness from your old injury are what you see in every photo, especially from the side.
- Day to day: you still see friends and do everything you want, but you angle yourself in group photos and keep your camera off on calls more than you'd like. You think about it most days.
- Breathing: the left side is blocked, worst at night (dry mouth, snoring) and when you run. Strips help a bit.
- The surgery: you're hoping for a straight nose that still looks like yours, and to breathe on both sides. You're not looking forward to the bruising, and you asked whether worrying about it looking "done" is normal; I've passed that to your team.
Did I get this right? You can correct anything.$d$,
   '2026-07-20 18:15:20+00', null, '2026-07-20 18:12:40+00');

-- ===========================================================================
-- Session 2: Jordan, post-op 6 weeks (en)
-- ===========================================================================
insert into public.messages (id, session_id, seq, role, content, input_mode, tokens_in, tokens_out, latency_ms, created_at) values
  ('d3a0c003-0002-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000002', 1, 'assistant',
   $d$Hi Jordan, good to talk again. Last time, before your surgery, you told me the bump and crookedness were what you saw in every photo, that you kept your camera off on calls, and that the left side of your nose was blocked at night and when running. It's been about six weeks. How are things now?$d$,
   null, 4680, 84, 2150, '2026-09-08 19:30:04+00'),
  ('d3a0c003-0002-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000002', 2, 'patient',
   $d$Really different, honestly. The bump's gone and it's straight. It's still swollen at the tip so it looks a bit rounder than I expected, but the surgeon said that takes months.$d$,
   'text', null, null, null, '2026-09-08 19:31:10+00'),
  ('d3a0c003-0002-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000002', 3, 'assistant',
   $d$That sounds like a big shift. When you look at it in photos or on camera now, what goes through your head?$d$,
   null, 4910, 33, 1520, '2026-09-08 19:31:13+00'),
  ('d3a0c003-0002-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000002', 4, 'patient',
   $d$I actually turned my camera back on for calls. I caught myself looking at my profile in a shop window the other day and thinking 'oh, that's fine'. Which is new. The tip's still puffy though, and I check it in the mirror every morning to see if it's gone down.$d$,
   'voice', null, null, null, '2026-09-08 19:32:30+00'),
  ('d3a0c003-0002-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000002', 5, 'assistant',
   $d$That shop-window moment is a lovely detail. And you know the tip swelling is temporary but you're keeping an eye on it. How about the breathing, especially at night and when you run?$d$,
   null, 5150, 48, 1690, '2026-09-08 19:32:34+00'),
  ('d3a0c003-0002-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000002', 6, 'patient',
   $d$Massively better. I sleep through, no dry mouth. I started running again last week and I can breathe through my nose the whole way. Both sides.$d$,
   'text', null, null, null, '2026-09-08 19:33:25+00'),
  ('d3a0c003-0002-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000002', 7, 'assistant',
   $d$Great to hear. Any pain, numbness or other odd sensations around the nose?$d$,
   null, 5360, 22, 1310, '2026-09-08 19:33:28+00'),
  ('d3a0c003-0002-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000002', 8, 'patient',
   $d$No pain now. The tip is still numb, it feels weird when I touch it or wash my face, like it's not mine. And there's a tiny bit of stiffness when I smile wide. Nobody warned me the numbness would last this long.$d$,
   'text', null, null, null, '2026-09-08 19:34:40+00'),
  ('d3a0c003-0002-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000002', 9, 'assistant',
   $d$Noted: the numbness, and that it's lasted longer than you expected. I'd like to check in on how you've been feeling in yourself, mood-wise, since the operation. Is that okay?$d$,
   null, 5600, 47, 1720, '2026-09-08 19:34:44+00'),
  ('d3a0c003-0002-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000002', 10, 'patient',
   $d$I'd rather not go into that today, it's fine. Can we move on?$d$,
   'text', null, null, null, '2026-09-08 19:35:15+00'),
  ('d3a0c003-0002-4000-8000-000000000011', 'd3a0c002-0000-4000-8000-000000000002', 11, 'system-event',
   $d$Control phrase detected (rather-not). Construct psych.mood marked declined for this session.$d$,
   null, null, null, null, '2026-09-08 19:35:15+00'),
  ('d3a0c003-0002-4000-8000-000000000012', 'd3a0c002-0000-4000-8000-000000000002', 12, 'assistant',
   $d$Of course, we'll leave that. Last thing: looking back, how do you feel about the decision to go ahead, and was there anything you wish you'd known beforehand?$d$,
   null, 5790, 41, 1580, '2026-09-08 19:35:19+00'),
  ('d3a0c003-0002-4000-8000-000000000013', 'd3a0c002-0000-4000-8000-000000000002', 13, 'patient',
   $d$No regrets at all, I should have done it years ago. The only thing is the numbness and how long the swelling takes. I'd have liked a clearer timeline. And I was back at work in ten days, which was fine.$d$,
   'text', null, null, null, '2026-09-08 19:36:35+00'),
  ('d3a0c003-0002-4000-8000-000000000014', 'd3a0c002-0000-4000-8000-000000000002', 14, 'assistant',
   $d$Thanks Jordan. So: the bump and crookedness are gone and you're comfortable on camera and in photos again; the tip is still swollen and you check it each morning; breathing is much better on both sides, day and night; the tip is numb and slightly stiff on a wide smile, and you'd have liked a clearer timeline for those; no regrets about the decision; back at work within ten days. Did I get this right?$d$,
   null, 6040, 104, 2380, '2026-09-08 19:36:41+00'),
  ('d3a0c003-0002-4000-8000-000000000015', 'd3a0c002-0000-4000-8000-000000000002', 15, 'patient',
   $d$Spot on.$d$,
   'text', null, null, null, '2026-09-08 19:37:00+00');

insert into public.construct_evidence (id, session_id, construct_id, message_id, patient_quote, quote_gloss_en, severity, confidence, interference, note, created_at) values
  ('d3a0c004-0002-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000002', 'appearance.nose', 'd3a0c003-0002-4000-8000-000000000002',
   $d$The bump's gone and it's straight.$d$, $d$The bump's gone and it's straight.$d$,
   'none', 0.90, '{}', 'Primary concern resolved; residual tip swelling noted separately.', '2026-09-08 19:31:12+00'),
  ('d3a0c004-0002-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000002', 'adverse.swelling_bruising', 'd3a0c003-0002-4000-8000-000000000002',
   $d$It's still swollen at the tip so it looks a bit rounder than I expected$d$, $d$It's still swollen at the tip so it looks a bit rounder than I expected$d$,
   'mild', 0.80, '{}', 'Expected residual tip swelling; patient aware it is temporary.', '2026-09-08 19:31:12+00'),
  ('d3a0c004-0002-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000002', 'outcome.result', 'd3a0c003-0002-4000-8000-000000000002',
   $d$Really different, honestly. The bump's gone and it's straight.$d$, $d$Really different, honestly. The bump's gone and it's straight.$d$,
   'none', 0.80, '{}', 'Pleased with result at 6 weeks.', '2026-09-08 19:31:12+00'),
  ('d3a0c004-0002-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000002', 'psych.self_confidence', 'd3a0c003-0002-4000-8000-000000000004',
   $d$I actually turned my camera back on for calls.$d$, $d$I actually turned my camera back on for calls.$d$,
   'none', 0.80, '{}', 'Work-related confidence restored.', '2026-09-08 19:32:32+00'),
  ('d3a0c004-0002-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000002', 'appearance.overall', 'd3a0c003-0002-4000-8000-000000000004',
   $d$I caught myself looking at my profile in a shop window the other day and thinking 'oh, that's fine'.$d$, $d$I caught myself looking at my profile in a shop window the other day and thinking 'oh, that's fine'.$d$,
   'none', 0.75, '{}', null, '2026-09-08 19:32:32+00'),
  ('d3a0c004-0002-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000002', 'social.avoidance', 'd3a0c003-0002-4000-8000-000000000004',
   $d$I actually turned my camera back on for calls.$d$, $d$I actually turned my camera back on for calls.$d$,
   'none', 0.70, '{}', 'Camera avoidance resolved; photos not explicitly discussed.', '2026-09-08 19:32:32+00'),
  ('d3a0c004-0002-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000002', 'distress.preoccupation', 'd3a0c003-0002-4000-8000-000000000004',
   $d$I check it in the mirror every morning to see if it's gone down.$d$, $d$I check it in the mirror every morning to see if it's gone down.$d$,
   'mild', 0.70, '{}', 'Daily checking of tip swelling; framed as monitoring rather than distress.', '2026-09-08 19:32:32+00'),
  ('d3a0c004-0002-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000002', 'function.breathing', 'd3a0c003-0002-4000-8000-000000000006',
   $d$I sleep through, no dry mouth. I started running again last week and I can breathe through my nose the whole way. Both sides.$d$, $d$I sleep through, no dry mouth. I started running again last week and I can breathe through my nose the whole way. Both sides.$d$,
   'none', 0.90, '{}', 'Obstruction resolved at night and during exercise.', '2026-09-08 19:33:27+00'),
  ('d3a0c004-0002-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000002', 'adverse.pain_discomfort', 'd3a0c003-0002-4000-8000-000000000008',
   $d$No pain now.$d$, $d$No pain now.$d$,
   'none', 0.85, '{}', null, '2026-09-08 19:34:42+00'),
  ('d3a0c004-0002-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000002', 'adverse.numbness_sensation', 'd3a0c003-0002-4000-8000-000000000008',
   $d$The tip is still numb, it feels weird when I touch it or wash my face, like it's not mine.$d$, $d$The tip is still numb, it feels weird when I touch it or wash my face, like it's not mine.$d$,
   'moderate', 0.80, '{daily-activities}', 'Persistent tip numbness noticed during daily care; bothersome and unexpected in duration.', '2026-09-08 19:34:42+00'),
  ('d3a0c004-0002-4000-8000-000000000011', 'd3a0c002-0000-4000-8000-000000000002', 'function.facial_expression', 'd3a0c003-0002-4000-8000-000000000008',
   $d$there's a tiny bit of stiffness when I smile wide$d$, $d$there's a tiny bit of stiffness when I smile wide$d$,
   'mild', 0.70, '{}', 'Minor stiffness on wide smile; not in focus list, recorded for completeness.', '2026-09-08 19:34:42+00'),
  ('d3a0c004-0002-4000-8000-000000000012', 'd3a0c002-0000-4000-8000-000000000002', 'outcome.information', 'd3a0c003-0002-4000-8000-000000000008',
   $d$Nobody warned me the numbness would last this long.$d$, $d$Nobody warned me the numbness would last this long.$d$,
   'moderate', 0.70, '{}', 'Gap in pre-operative information about duration of numbness.', '2026-09-08 19:34:42+00'),
  ('d3a0c004-0002-4000-8000-000000000013', 'd3a0c002-0000-4000-8000-000000000002', 'psych.mood', 'd3a0c003-0002-4000-8000-000000000010',
   $d$I'd rather not go into that today, it's fine.$d$, $d$I'd rather not go into that today, it's fine.$d$,
   'declined', 1.00, '{}', 'Patient declined (control phrase: rather-not). Not revisited.', '2026-09-08 19:35:15+00'),
  ('d3a0c004-0002-4000-8000-000000000014', 'd3a0c002-0000-4000-8000-000000000002', 'outcome.decision', 'd3a0c003-0002-4000-8000-000000000013',
   $d$No regrets at all, I should have done it years ago.$d$, $d$No regrets at all, I should have done it years ago.$d$,
   'none', 0.90, '{}', null, '2026-09-08 19:36:37+00'),
  ('d3a0c004-0002-4000-8000-000000000015', 'd3a0c002-0000-4000-8000-000000000002', 'outcome.information', 'd3a0c003-0002-4000-8000-000000000013',
   $d$I'd have liked a clearer timeline.$d$, $d$I'd have liked a clearer timeline.$d$,
   'moderate', 0.80, '{}', 'Wanted clearer expectations for swelling and numbness duration.', '2026-09-08 19:36:37+00'),
  ('d3a0c004-0002-4000-8000-000000000016', 'd3a0c002-0000-4000-8000-000000000002', 'recovery.daily_activities', 'd3a0c003-0002-4000-8000-000000000013',
   $d$I was back at work in ten days, which was fine.$d$, $d$I was back at work in ten days, which was fine.$d$,
   'none', 0.80, '{}', 'Return to work within 10 days; running resumed at ~5 weeks.', '2026-09-08 19:36:37+00');

insert into public.probe_findings (id, session_id, construct_id, finding, category, message_id, created_at) values
  ('d3a0c005-0002-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000002', 'adverse.swelling_bruising',
   'Tip swelling persisting at 6 weeks; surgeon told them it takes months; patient checks it in the mirror every morning.', 'trajectory', 'd3a0c003-0002-4000-8000-000000000004', '2026-09-08 19:32:32+00'),
  ('d3a0c005-0002-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000002', 'function.breathing',
   'Sleeps through without dry mouth; running again since week 5 with nasal breathing on both sides.', 'trajectory', 'd3a0c003-0002-4000-8000-000000000006', '2026-09-08 19:33:27+00'),
  ('d3a0c005-0002-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000002', 'adverse.numbness_sensation',
   'Tip numbness persisting at 6 weeks; noticed when touching the face or washing; patient did not expect it to last this long.', 'trajectory', 'd3a0c003-0002-4000-8000-000000000008', '2026-09-08 19:34:42+00'),
  ('d3a0c005-0002-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000002', 'adverse.numbness_sensation',
   'Noticed mainly during face washing and touch; described as feeling "like it is not mine".', 'triggers', 'd3a0c003-0002-4000-8000-000000000008', '2026-09-08 19:34:42+00'),
  ('d3a0c005-0002-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000002', 'outcome.information',
   'Would have liked a clearer timeline for how long swelling and numbness last.', 'impact', 'd3a0c003-0002-4000-8000-000000000013', '2026-09-08 19:36:37+00'),
  ('d3a0c005-0002-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000002', 'outcome.result',
   'Result matches hopes (straight, no bump); tip currently rounder than expected while swelling settles.', 'expectation', 'd3a0c003-0002-4000-8000-000000000002', '2026-09-08 19:31:12+00');

insert into public.session_profiles (session_id, profile, patient_summary, patient_summary_confirmed_at, patient_corrections, generated_at) values
  ('d3a0c002-0000-4000-8000-000000000002',
   $d${
  "generated_with": {"model": "claude-sonnet-5", "prompt_version": "demo-seed-1", "map": "face-q-adult@2"},
  "domains": [
    {
      "id": "appearance", "label": "Satisfaction with facial appearance",
      "severity": "none", "confidence": 0.85,
      "summary_en": "The bump and deviation are gone; the patient describes the nose as straight and is comfortable seeing their profile. Tip still swollen, which they accept as temporary.",
      "constructs": [
        {"id": "appearance.nose", "severity": "none", "confidence": 0.90,
         "quotes": [{"text": "The bump's gone and it's straight.", "lang": "en", "gloss_en": "The bump's gone and it's straight."}],
         "findings": [], "status": "covered"},
        {"id": "appearance.overall", "severity": "none", "confidence": 0.75,
         "quotes": [{"text": "I caught myself looking at my profile in a shop window the other day and thinking 'oh, that's fine'.", "lang": "en", "gloss_en": "I caught myself looking at my profile in a shop window the other day and thinking 'oh, that's fine'."}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "psychological", "label": "Psychological function",
      "severity": "none", "confidence": 0.80,
      "summary_en": "Confidence on camera restored (camera back on for calls). Mood was declined for discussion today and is not inferred.",
      "constructs": [
        {"id": "psych.self_confidence", "severity": "none", "confidence": 0.80,
         "quotes": [{"text": "I actually turned my camera back on for calls.", "lang": "en", "gloss_en": "I actually turned my camera back on for calls."}],
         "findings": [], "status": "covered"},
        {"id": "psych.mood", "severity": "declined", "confidence": 1.0,
         "quotes": [{"text": "I'd rather not go into that today, it's fine.", "lang": "en", "gloss_en": "I'd rather not go into that today, it's fine."}],
         "findings": [], "status": "declined"}
      ]
    },
    {
      "id": "social", "label": "Social function",
      "severity": "none", "confidence": 0.70,
      "summary_en": "Camera avoidance has resolved. Group-photo behaviour was not revisited this session.",
      "constructs": [
        {"id": "social.avoidance", "severity": "none", "confidence": 0.70,
         "quotes": [{"text": "I actually turned my camera back on for calls.", "lang": "en", "gloss_en": "I actually turned my camera back on for calls."}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "distress", "label": "Appearance-related distress",
      "severity": "mild", "confidence": 0.70,
      "summary_en": "Daily mirror-checking of the tip swelling, framed as monitoring; markedly less preoccupation than at baseline.",
      "constructs": [
        {"id": "distress.preoccupation", "severity": "mild", "confidence": 0.70,
         "quotes": [{"text": "I check it in the mirror every morning to see if it's gone down.", "lang": "en", "gloss_en": "I check it in the mirror every morning to see if it's gone down."}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "function", "label": "Facial function",
      "severity": "none", "confidence": 0.80,
      "summary_en": "Nasal breathing resolved on both sides at night and while running. Minor stiffness on a wide smile.",
      "constructs": [
        {"id": "function.breathing", "severity": "none", "confidence": 0.90,
         "quotes": [{"text": "I sleep through, no dry mouth. I started running again last week and I can breathe through my nose the whole way. Both sides.", "lang": "en", "gloss_en": "I sleep through, no dry mouth. I started running again last week and I can breathe through my nose the whole way. Both sides."}],
         "findings": [{"category": "trajectory", "text": "Sleeps through without dry mouth; running again since week 5 with nasal breathing on both sides."}],
         "status": "covered"},
        {"id": "function.facial_expression", "severity": "mild", "confidence": 0.70,
         "quotes": [{"text": "there's a tiny bit of stiffness when I smile wide", "lang": "en", "gloss_en": "there's a tiny bit of stiffness when I smile wide"}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "adverse", "label": "Adverse effects and symptoms",
      "severity": "mild", "confidence": 0.82,
      "summary_en": "No pain. Residual tip swelling (expected). Persistent tip numbness is the main bother and lasted longer than the patient expected. Worst: numbness, moderate.",
      "constructs": [
        {"id": "adverse.pain_discomfort", "severity": "none", "confidence": 0.85,
         "quotes": [{"text": "No pain now.", "lang": "en", "gloss_en": "No pain now."}],
         "findings": [], "status": "covered"},
        {"id": "adverse.swelling_bruising", "severity": "mild", "confidence": 0.80,
         "quotes": [{"text": "It's still swollen at the tip so it looks a bit rounder than I expected", "lang": "en", "gloss_en": "It's still swollen at the tip so it looks a bit rounder than I expected"}],
         "findings": [{"category": "trajectory", "text": "Tip swelling persisting at 6 weeks; surgeon told them it takes months; patient checks it in the mirror every morning."}],
         "status": "covered"},
        {"id": "adverse.numbness_sensation", "severity": "moderate", "confidence": 0.80,
         "quotes": [{"text": "The tip is still numb, it feels weird when I touch it or wash my face, like it's not mine.", "lang": "en", "gloss_en": "The tip is still numb, it feels weird when I touch it or wash my face, like it's not mine."}],
         "findings": [
           {"category": "trajectory", "text": "Tip numbness persisting at 6 weeks; noticed when touching the face or washing; patient did not expect it to last this long."},
           {"category": "triggers", "text": "Noticed mainly during face washing and touch; described as feeling \"like it is not mine\"."}
         ],
         "status": "drill_down_done"}
      ]
    },
    {
      "id": "recovery", "label": "Recovery and early life impact",
      "severity": "none", "confidence": 0.80,
      "summary_en": "Back at work within ten days; running resumed around week five.",
      "constructs": [
        {"id": "recovery.daily_activities", "severity": "none", "confidence": 0.80,
         "quotes": [{"text": "I was back at work in ten days, which was fine.", "lang": "en", "gloss_en": "I was back at work in ten days, which was fine."}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "outcome", "label": "Satisfaction with outcome, decision and information",
      "severity": "none", "confidence": 0.83,
      "summary_en": "Pleased with the result and confident in the decision. Information gap: would have liked a clearer timeline for swelling and numbness. Worst: information, moderate.",
      "constructs": [
        {"id": "outcome.result", "severity": "none", "confidence": 0.80,
         "quotes": [{"text": "Really different, honestly. The bump's gone and it's straight.", "lang": "en", "gloss_en": "Really different, honestly. The bump's gone and it's straight."}],
         "findings": [{"category": "expectation", "text": "Result matches hopes (straight, no bump); tip currently rounder than expected while swelling settles."}],
         "status": "covered"},
        {"id": "outcome.decision", "severity": "none", "confidence": 0.90,
         "quotes": [{"text": "No regrets at all, I should have done it years ago.", "lang": "en", "gloss_en": "No regrets at all, I should have done it years ago."}],
         "findings": [], "status": "covered"},
        {"id": "outcome.information", "severity": "moderate", "confidence": 0.80,
         "quotes": [
           {"text": "Nobody warned me the numbness would last this long.", "lang": "en", "gloss_en": "Nobody warned me the numbness would last this long."},
           {"text": "I'd have liked a clearer timeline.", "lang": "en", "gloss_en": "I'd have liked a clearer timeline."}
         ],
         "findings": [{"category": "impact", "text": "Would have liked a clearer timeline for how long swelling and numbness last."}],
         "status": "drill_down_done"}
      ]
    }
  ],
  "needs_clarification": [],
  "not_covered": ["social.comfort", "distress.hiding", "adverse.asymmetry"],
  "declined": ["psych.mood"],
  "patient_questions": [],
  "change_from_prior": [
    {"construct_id": "appearance.nose", "prior": "moderate", "now": "none", "note": "Bump and deviation resolved; only temporary tip swelling remains."},
    {"construct_id": "appearance.overall", "prior": "mild", "now": "none", "note": "Comfortable with profile in reflections and on camera."},
    {"construct_id": "function.breathing", "prior": "moderate", "now": "none", "note": "Sleeping through and running with nasal breathing on both sides."},
    {"construct_id": "psych.self_confidence", "prior": "mild", "now": "none", "note": "Camera back on for work calls."},
    {"construct_id": "social.avoidance", "prior": "mild", "now": "none", "note": "Camera avoidance resolved; photo behaviour not revisited."},
    {"construct_id": "distress.preoccupation", "prior": "moderate", "now": "mild", "note": "Daily thoughts replaced by monitoring of tip swelling."}
  ],
  "disclaimer": "AI-assisted inferred profile. Not a validated FACE-Q score."
}$d$::jsonb,
   $d$Here is what I heard today:
- Your nose: the bump and the crookedness are gone and it's straight. The tip is still puffy and you check it each morning, knowing it takes months to settle.
- Day to day: your camera is back on for calls, and you were fine with your profile in a shop window.
- Breathing: much better on both sides, sleeping through with no dry mouth, and running again.
- Sensations: no pain; the tip is numb and feels odd when you touch it or wash your face, with a little stiffness on a wide smile. You'd have liked a clearer timeline for that.
- The decision: no regrets. Back at work in ten days.
- We left the mood topic for today, as you asked.
Did I get this right? You can correct anything.$d$,
   '2026-09-08 19:41:30+00', null, '2026-09-08 19:38:10+00');

-- ===========================================================================
-- Session 3: Marisol, baseline, facelift (es)
-- ===========================================================================
insert into public.messages (id, session_id, seq, role, content, input_mode, tokens_in, tokens_out, latency_ms, created_at) values
  ('d3a0c003-0003-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000003', 1, 'assistant',
   $d$Hola Marisol, gracias por dedicarme este rato. Quiero entender cómo se siente con su cara y cómo le afecta en el día a día antes de la operación. No hay respuestas correctas y puede saltarse lo que quiera. Para empezar, ¿qué le hizo plantearse el lifting?$d$,
   null, 4210, 92, 2260, '2026-08-12 16:10:05+00'),
  ('d3a0c003-0003-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000003', 2, 'patient',
   $d$Pues mire, desde hace unos años me veo en el espejo y no me reconozco. La papada, los cachetes caídos... Me veo mucho mayor de lo que me siento. Yo por dentro tengo cincuenta y en las fotos parezco mi madre.$d$,
   'voice', null, null, null, '2026-08-12 16:11:20+00'),
  ('d3a0c003-0003-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000003', 3, 'assistant',
   $d$Entiendo, esa sensación de que la cara no va con cómo se siente por dentro. ¿Qué es lo que más le molesta cuando se mira: la papada, las mejillas, la piel...?$d$,
   null, 4480, 54, 1770, '2026-08-12 16:11:24+00'),
  ('d3a0c003-0003-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000003', 4, 'patient',
   $d$La papada, sobre todo. Y las líneas que me bajan de la nariz a la boca. La piel no está mal, yo me cuido, pero está todo como caído.$d$,
   'voice', null, null, null, '2026-08-12 16:12:15+00'),
  ('d3a0c003-0003-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000003', 5, 'assistant',
   $d$Queda claro que es más la caída que la piel en sí. ¿Y cómo le afecta esto en su vida? Por ejemplo, ¿le cuesta salir en fotos, verse en videollamadas, o estar en reuniones con gente?$d$,
   null, 4700, 60, 1810, '2026-08-12 16:12:19+00'),
  ('d3a0c003-0003-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000003', 6, 'patient',
   $d$En las fotos siempre me pongo detrás o me tapo con alguien. Si me mandan una foto del grupo la borro. Con mis amigas de toda la vida estoy bien, pero cuando conozco gente nueva me da vergüenza, como que me juzgan por vieja.$d$,
   'voice', null, null, null, '2026-08-12 16:13:40+00'),
  ('d3a0c003-0003-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000003', 7, 'assistant',
   $d$Gracias por contármelo. Esa vergüenza con gente nueva, ¿hace que evite planes o situaciones, o va y lo pasa mal?$d$,
   null, 4950, 38, 1560, '2026-08-12 16:13:44+00'),
  ('d3a0c003-0003-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000003', 8, 'patient',
   $d$Voy, pero lo paso regular. He dejado de ir a la piscina con las nietas porque sin maquillaje y con el pelo mojado no me veo bien. Eso sí me duele, porque a ellas les encanta.$d$,
   'voice', null, null, null, '2026-08-12 16:14:50+00'),
  ('d3a0c003-0003-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000003', 9, 'assistant',
   $d$Eso es importante, lo de dejar de ir a la piscina con sus nietas. ¿Cuánto tiempo lleva sintiéndose así, y diría que va a más?$d$,
   null, 5180, 44, 1620, '2026-08-12 16:14:54+00'),
  ('d3a0c003-0003-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000003', 10, 'patient',
   $d$Tres o cuatro años. Desde que me jubilé, creo, que tengo más tiempo para mirarme. Y sí, va a más. Pienso en ello casi todos los días.$d$,
   'voice', null, null, null, '2026-08-12 16:15:45+00'),
  ('d3a0c003-0003-4000-8000-000000000011', 'd3a0c002-0000-4000-8000-000000000003', 11, 'assistant',
   $d$¿Y cómo le tiene el ánimo? ¿Diría que le baja el ánimo o le pone triste, o es más una molestia?$d$,
   null, 5390, 36, 1500, '2026-08-12 16:15:49+00'),
  ('d3a0c003-0003-4000-8000-000000000012', 'd3a0c002-0000-4000-8000-000000000003', 12, 'patient',
   $d$Algún día me pongo triste, sobre todo después de una foto. Pero no estoy deprimida, ¿eh? Duermo bien y tengo ganas de hacer cosas. Es más rabia que tristeza.$d$,
   'voice', null, null, null, '2026-08-12 16:16:50+00'),
  ('d3a0c003-0003-4000-8000-000000000013', 'd3a0c002-0000-4000-8000-000000000003', 13, 'assistant',
   $d$Entendido: más rabia que tristeza, y sin que le quite el sueño ni las ganas. Última cosa por hoy: ¿qué espera de la operación y hay algo que le preocupe?$d$,
   null, 5610, 48, 1680, '2026-08-12 16:16:54+00'),
  ('d3a0c003-0003-4000-8000-000000000014', 'd3a0c002-0000-4000-8000-000000000003', 14, 'patient',
   $d$Espero verme como me siento, no como una niña de veinte, solo descansada y con el cuello más limpio. Me preocupan las cicatrices delante de las orejas, que se noten cuando me recojo el pelo. ¿Se notan mucho?$d$,
   'voice', null, null, null, '2026-08-12 16:18:20+00'),
  ('d3a0c003-0003-4000-8000-000000000015', 'd3a0c002-0000-4000-8000-000000000003', 15, 'assistant',
   $d$Lo de las cicatrices es una pregunta muy buena para su cirujano; yo se la haré llegar al equipo en lugar de responderla. Le resumo lo que he escuchado: la papada y las líneas de la nariz a la boca es lo que más le molesta; se ve mayor de lo que se siente; evita las fotos y ha dejado de ir a la piscina con sus nietas; con sus amigas está bien pero con gente nueva le da vergüenza; piensa en ello casi a diario, con más rabia que tristeza; espera verse descansada, no distinta, y le preocupan las cicatrices. ¿Lo he entendido bien?$d$,
   null, 5920, 142, 2590, '2026-08-12 16:18:27+00'),
  ('d3a0c003-0003-4000-8000-000000000016', 'd3a0c002-0000-4000-8000-000000000003', 16, 'patient',
   $d$Sí, tal cual.$d$,
   'text', null, null, null, '2026-08-12 16:19:00+00');

insert into public.construct_evidence (id, session_id, construct_id, message_id, patient_quote, quote_gloss_en, severity, confidence, interference, note, created_at) values
  ('d3a0c004-0003-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000003', 'appearance.overall', 'd3a0c003-0003-4000-8000-000000000002',
   $d$desde hace unos años me veo en el espejo y no me reconozco$d$, $d$for a few years now I look in the mirror and don't recognise myself$d$,
   'moderate', 0.85, '{}', 'Global dissatisfaction framed as not recognising herself.', '2026-08-12 16:11:22+00'),
  ('d3a0c004-0003-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000003', 'aging.appraisal', 'd3a0c003-0003-4000-8000-000000000002',
   $d$Me veo mucho mayor de lo que me siento. Yo por dentro tengo cincuenta y en las fotos parezco mi madre.$d$, $d$I look much older than I feel. Inside I'm fifty and in photos I look like my mother.$d$,
   'moderate', 0.90, '{}', 'Clear mismatch between felt age and perceived facial age.', '2026-08-12 16:11:22+00'),
  ('d3a0c004-0003-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000003', 'appearance.chin_jawline', 'd3a0c003-0003-4000-8000-000000000004',
   $d$La papada, sobre todo.$d$, $d$The double chin, above all.$d$,
   'moderate', 0.85, '{}', 'Neck/submental fullness is the primary feature concern.', '2026-08-12 16:12:17+00'),
  ('d3a0c004-0003-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000003', 'appearance.cheeks', 'd3a0c003-0003-4000-8000-000000000004',
   $d$las líneas que me bajan de la nariz a la boca ... está todo como caído$d$, $d$the lines running from my nose down to my mouth ... everything is sort of sagging$d$,
   'moderate', 0.75, '{}', 'Mid-face descent and nasolabial folds.', '2026-08-12 16:12:17+00'),
  ('d3a0c004-0003-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000003', 'appearance.skin', 'd3a0c003-0003-4000-8000-000000000004',
   $d$La piel no está mal, yo me cuido$d$, $d$My skin isn't bad, I look after myself$d$,
   'none', 0.80, '{}', 'Skin quality not a concern.', '2026-08-12 16:12:17+00'),
  ('d3a0c004-0003-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000003', 'social.avoidance', 'd3a0c003-0003-4000-8000-000000000006',
   $d$En las fotos siempre me pongo detrás o me tapo con alguien. Si me mandan una foto del grupo la borro.$d$, $d$In photos I always stand at the back or hide behind someone. If someone sends me the group photo I delete it.$d$,
   'moderate', 0.85, '{social}', 'Active photo avoidance and deletion.', '2026-08-12 16:13:42+00'),
  ('d3a0c004-0003-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000003', 'social.comfort', 'd3a0c003-0003-4000-8000-000000000006',
   $d$Con mis amigas de toda la vida estoy bien, pero cuando conozco gente nueva me da vergüenza, como que me juzgan por vieja.$d$, $d$With my lifelong friends I'm fine, but when I meet new people I feel ashamed, as if they judge me for being old.$d$,
   'moderate', 0.80, '{social}', 'Comfortable with familiar company; shame with new people.', '2026-08-12 16:13:42+00'),
  ('d3a0c004-0003-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000003', 'psych.self_confidence', 'd3a0c003-0003-4000-8000-000000000006',
   $d$me da vergüenza, como que me juzgan por vieja$d$, $d$I feel ashamed, as if they judge me for being old$d$,
   'moderate', 0.70, '{social}', 'Confidence undermined with unfamiliar people specifically.', '2026-08-12 16:13:42+00'),
  ('d3a0c004-0003-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000003', 'social.avoidance', 'd3a0c003-0003-4000-8000-000000000008',
   $d$He dejado de ir a la piscina con las nietas porque sin maquillaje y con el pelo mojado no me veo bien.$d$, $d$I've stopped going to the pool with my granddaughters because without makeup and with wet hair I don't look good to myself.$d$,
   'moderate', 0.90, '{social,relationships}', 'Has given up a valued family activity; she attends other events but finds them hard.', '2026-08-12 16:14:52+00'),
  ('d3a0c004-0003-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000003', 'distress.hiding', 'd3a0c003-0003-4000-8000-000000000008',
   $d$sin maquillaje y con el pelo mojado no me veo bien$d$, $d$without makeup and with wet hair I don't look good to myself$d$,
   'mild', 0.55, '{}', 'Suggests reliance on makeup; extent of concealment not explored. Needs clarification.', '2026-08-12 16:14:52+00'),
  ('d3a0c004-0003-4000-8000-000000000011', 'd3a0c002-0000-4000-8000-000000000003', 'distress.preoccupation', 'd3a0c003-0003-4000-8000-000000000010',
   $d$Pienso en ello casi todos los días.$d$, $d$I think about it almost every day.$d$,
   'moderate', 0.85, '{}', 'Near-daily thoughts, worsening over 3-4 years since retirement.', '2026-08-12 16:15:47+00'),
  ('d3a0c004-0003-4000-8000-000000000012', 'd3a0c002-0000-4000-8000-000000000003', 'psych.mood', 'd3a0c003-0003-4000-8000-000000000012',
   $d$Algún día me pongo triste, sobre todo después de una foto. Pero no estoy deprimida, ¿eh? Duermo bien y tengo ganas de hacer cosas. Es más rabia que tristeza.$d$, $d$Some days I get sad, especially after a photo. But I'm not depressed, okay? I sleep well and I feel like doing things. It's more anger than sadness.$d$,
   'mild', 0.80, '{}', 'Occasional low days triggered by photos; sleep and motivation preserved; explicitly denies depression.', '2026-08-12 16:16:52+00');

insert into public.probe_findings (id, session_id, construct_id, finding, category, message_id, created_at) values
  ('d3a0c005-0003-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000003', 'appearance.overall',
   'Onset three to four years ago, around retirement, when she had more time to look at herself.', 'onset', 'd3a0c003-0003-4000-8000-000000000010', '2026-08-12 16:15:47+00'),
  ('d3a0c005-0003-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000003', 'appearance.overall',
   'She feels it is getting worse over time.', 'trajectory', 'd3a0c003-0003-4000-8000-000000000010', '2026-08-12 16:15:47+00'),
  ('d3a0c005-0003-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000003', 'social.avoidance',
   'Has stopped going to the pool with her granddaughters because she does not feel presentable without makeup and with wet hair; this upsets her because they love it.', 'impact', 'd3a0c003-0003-4000-8000-000000000008', '2026-08-12 16:14:52+00'),
  ('d3a0c005-0003-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000003', 'social.comfort',
   'Discomfort is specific to meeting new people, whom she feels judge her as old; fine with lifelong friends.', 'triggers', 'd3a0c003-0003-4000-8000-000000000006', '2026-08-12 16:13:42+00'),
  ('d3a0c005-0003-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000003', 'psych.mood',
   'Low days usually follow seeing a photo of herself; describes the feeling as anger more than sadness.', 'triggers', 'd3a0c003-0003-4000-8000-000000000012', '2026-08-12 16:16:52+00'),
  ('d3a0c005-0003-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000003', 'aging.appraisal',
   'Hopes to look the way she feels: rested, with a cleaner neck line, not twenty years younger.', 'expectation', 'd3a0c003-0003-4000-8000-000000000014', '2026-08-12 16:18:22+00'),
  ('d3a0c005-0003-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000003', 'adverse.scarring',
   'Worried that scars in front of the ears will show when her hair is tied back.', 'expectation', 'd3a0c003-0003-4000-8000-000000000014', '2026-08-12 16:18:22+00'),
  ('d3a0c005-0003-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000003', 'adverse.scarring',
   'Asked whether the scars in front of the ears are very noticeable. Not answered clinically; passed to the surgeon.', 'patient_question', 'd3a0c003-0003-4000-8000-000000000014', '2026-08-12 16:18:22+00');

insert into public.session_profiles (session_id, profile, patient_summary, patient_summary_confirmed_at, patient_corrections, generated_at) values
  ('d3a0c002-0000-4000-8000-000000000003',
   $d${
  "generated_with": {"model": "claude-sonnet-5", "prompt_version": "demo-seed-1", "map": "face-q-adult@2"},
  "domains": [
    {
      "id": "appearance", "label": "Satisfaction with facial appearance",
      "severity": "moderate", "confidence": 0.81,
      "summary_en": "Does not recognise herself in the mirror. Main concerns are neck/jawline fullness and mid-face descent with nasolabial lines; skin quality is not a concern.",
      "constructs": [
        {"id": "appearance.overall", "severity": "moderate", "confidence": 0.85,
         "quotes": [{"text": "desde hace unos años me veo en el espejo y no me reconozco", "lang": "es", "gloss_en": "for a few years now I look in the mirror and don't recognise myself"}],
         "findings": [
           {"category": "onset", "text": "Onset three to four years ago, around retirement, when she had more time to look at herself."},
           {"category": "trajectory", "text": "She feels it is getting worse over time."}
         ],
         "status": "drill_down_done"},
        {"id": "appearance.chin_jawline", "severity": "moderate", "confidence": 0.85,
         "quotes": [{"text": "La papada, sobre todo.", "lang": "es", "gloss_en": "The double chin, above all."}],
         "findings": [], "status": "drill_down_pending"},
        {"id": "appearance.cheeks", "severity": "moderate", "confidence": 0.75,
         "quotes": [{"text": "las líneas que me bajan de la nariz a la boca ... está todo como caído", "lang": "es", "gloss_en": "the lines running from my nose down to my mouth ... everything is sort of sagging"}],
         "findings": [], "status": "drill_down_pending"},
        {"id": "appearance.skin", "severity": "none", "confidence": 0.80,
         "quotes": [{"text": "La piel no está mal, yo me cuido", "lang": "es", "gloss_en": "My skin isn't bad, I look after myself"}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "aging", "label": "Age appraisal",
      "severity": "moderate", "confidence": 0.90,
      "summary_en": "Strong mismatch between felt age and how old her face looks; compares herself to her mother in photos. Hopes to look rested, not younger.",
      "constructs": [
        {"id": "aging.appraisal", "severity": "moderate", "confidence": 0.90,
         "quotes": [{"text": "Me veo mucho mayor de lo que me siento. Yo por dentro tengo cincuenta y en las fotos parezco mi madre.", "lang": "es", "gloss_en": "I look much older than I feel. Inside I'm fifty and in photos I look like my mother."}],
         "findings": [{"category": "expectation", "text": "Hopes to look the way she feels: rested, with a cleaner neck line, not twenty years younger."}],
         "status": "drill_down_done"}
      ]
    },
    {
      "id": "psychological", "label": "Psychological function",
      "severity": "mild", "confidence": 0.75,
      "summary_en": "Confidence is undermined with unfamiliar people. Mood: occasional low days after photos, described as anger more than sadness; sleep and motivation preserved and she explicitly denies depression. Worst: self-confidence, moderate.",
      "constructs": [
        {"id": "psych.self_confidence", "severity": "moderate", "confidence": 0.70,
         "quotes": [{"text": "me da vergüenza, como que me juzgan por vieja", "lang": "es", "gloss_en": "I feel ashamed, as if they judge me for being old"}],
         "findings": [], "status": "drill_down_pending"},
        {"id": "psych.mood", "severity": "mild", "confidence": 0.80,
         "quotes": [{"text": "Algún día me pongo triste, sobre todo después de una foto. Pero no estoy deprimida, ¿eh? Duermo bien y tengo ganas de hacer cosas. Es más rabia que tristeza.", "lang": "es", "gloss_en": "Some days I get sad, especially after a photo. But I'm not depressed, okay? I sleep well and I feel like doing things. It's more anger than sadness."}],
         "findings": [{"category": "triggers", "text": "Low days usually follow seeing a photo of herself; describes the feeling as anger more than sadness."}],
         "status": "covered"}
      ]
    },
    {
      "id": "social", "label": "Social function",
      "severity": "moderate", "confidence": 0.85,
      "summary_en": "Avoids and deletes photos and has given up swimming with her granddaughters, which upsets her. Comfortable with lifelong friends; ashamed with new people.",
      "constructs": [
        {"id": "social.avoidance", "severity": "moderate", "confidence": 0.90,
         "quotes": [
           {"text": "En las fotos siempre me pongo detrás o me tapo con alguien. Si me mandan una foto del grupo la borro.", "lang": "es", "gloss_en": "In photos I always stand at the back or hide behind someone. If someone sends me the group photo I delete it."},
           {"text": "He dejado de ir a la piscina con las nietas porque sin maquillaje y con el pelo mojado no me veo bien.", "lang": "es", "gloss_en": "I've stopped going to the pool with my granddaughters because without makeup and with wet hair I don't look good to myself."}
         ],
         "findings": [{"category": "impact", "text": "Has stopped going to the pool with her granddaughters because she does not feel presentable without makeup and with wet hair; this upsets her because they love it."}],
         "status": "drill_down_done"},
        {"id": "social.comfort", "severity": "moderate", "confidence": 0.80,
         "quotes": [{"text": "Con mis amigas de toda la vida estoy bien, pero cuando conozco gente nueva me da vergüenza, como que me juzgan por vieja.", "lang": "es", "gloss_en": "With my lifelong friends I'm fine, but when I meet new people I feel ashamed, as if they judge me for being old."}],
         "findings": [{"category": "triggers", "text": "Discomfort is specific to meeting new people, whom she feels judge her as old; fine with lifelong friends."}],
         "status": "drill_down_done"}
      ]
    },
    {
      "id": "distress", "label": "Appearance-related distress",
      "severity": "moderate", "confidence": 0.85,
      "summary_en": "Thinks about her appearance almost daily, worsening since retirement. Reliance on makeup is implied but concealment was not explored.",
      "constructs": [
        {"id": "distress.preoccupation", "severity": "moderate", "confidence": 0.85,
         "quotes": [{"text": "Pienso en ello casi todos los días.", "lang": "es", "gloss_en": "I think about it almost every day."}],
         "findings": [], "status": "drill_down_pending"},
        {"id": "distress.hiding", "severity": "mild", "confidence": 0.55,
         "quotes": [{"text": "sin maquillaje y con el pelo mojado no me veo bien", "lang": "es", "gloss_en": "without makeup and with wet hair I don't look good to myself"}],
         "findings": [], "status": "needs_clarification"}
      ]
    },
    {
      "id": "adverse", "label": "Adverse effects and symptoms",
      "severity": "unclear", "confidence": 0.0,
      "summary_en": "Pre-operative; no current symptoms discussed. She is worried about visible scars in front of the ears and asked whether they will show.",
      "constructs": [
        {"id": "adverse.scarring", "severity": "unclear", "confidence": 0.0,
         "quotes": [],
         "findings": [
           {"category": "expectation", "text": "Worried that scars in front of the ears will show when her hair is tied back."},
           {"category": "patient_question", "text": "Asked whether the scars in front of the ears are very noticeable. Not answered clinically; passed to the surgeon."}
         ],
         "status": "untouched"}
      ]
    }
  ],
  "needs_clarification": [
    {"construct_id": "distress.hiding", "reason": "Reliance on makeup implied by one remark; extent of concealment not asked."}
  ],
  "not_covered": ["adverse.swelling_bruising", "adverse.numbness_sensation", "adverse.pain_discomfort"],
  "declined": [],
  "patient_questions": ["¿Se notan mucho las cicatrices delante de las orejas? (Will the scars in front of the ears be very noticeable?)"],
  "change_from_prior": [],
  "disclaimer": "AI-assisted inferred profile. Not a validated FACE-Q score."
}$d$::jsonb,
   $d$Esto es lo que he escuchado hoy:
- Su cara: lo que más le molesta es la papada y las líneas de la nariz a la boca. Se ve mayor de lo que se siente, y desde que se jubiló le pasa más.
- Su día a día: en las fotos se pone detrás o las borra. Con sus amigas de siempre está bien, pero con gente nueva le da vergüenza. Ha dejado de ir a la piscina con sus nietas, y eso le duele.
- Su ánimo: algún día se pone triste, sobre todo tras una foto, pero duerme bien y tiene ganas de hacer cosas. Es más rabia que tristeza.
- La operación: espera verse descansada y como se siente, no distinta. Le preocupan las cicatrices delante de las orejas; esa pregunta se la paso a su cirujano.
¿Lo he entendido bien? Puede corregir lo que quiera.$d$,
   '2026-08-12 16:23:50+00', null, '2026-08-12 16:20:30+00');

-- ===========================================================================
-- Session 4: Sam (8-12), guardian respondent, cleft lip/palate, baseline (en)
-- ===========================================================================
insert into public.messages (id, session_id, seq, role, content, input_mode, tokens_in, tokens_out, latency_ms, created_at) values
  ('d3a0c003-0004-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000004', 1, 'assistant',
   $d$Hi, thanks for joining. I understand you're Sam's parent and you'll be answering for Sam today. I'd like to get a picture of how things are for Sam right now: his face, school, friends, eating and talking. Short answers are fine, and you can skip anything. To start, how does Sam seem to feel about his face at the moment?$d$,
   null, 3980, 84, 2090, '2026-08-26 17:00:04+00'),
  ('d3a0c003-0004-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000004', 2, 'patient',
   $d$Mostly ok. He doesn't talk about it much at home. But since he moved up a year at school he's started asking why his lip looks different.$d$,
   'text', null, null, null, '2026-08-26 17:01:05+00'),
  ('d3a0c003-0004-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000004', 3, 'assistant',
   $d$That's a new thing then, since the move. When he asks, what does he say, and how does he seem: curious, or upset?$d$,
   null, 4200, 34, 1480, '2026-08-26 17:01:08+00'),
  ('d3a0c003-0004-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000004', 4, 'patient',
   $d$More upset lately. Last week he came home and said a boy in his class called him 'wonky lip'. He cried at bedtime. That's the first time I've seen him cry about it.$d$,
   'text', null, null, null, '2026-08-26 17:02:20+00'),
  ('d3a0c003-0004-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000004', 5, 'assistant',
   $d$I'm sorry to hear that, and thank you for telling me. Does the school know about it, and has it happened more than once?$d$,
   null, 4420, 32, 1450, '2026-08-26 17:02:23+00'),
  ('d3a0c003-0004-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000004', 6, 'patient',
   $d$I emailed his teacher, she's been good. As far as I know it was the one boy, a couple of times. Sam says it's stopped but he's gone a bit quiet about school.$d$,
   'text', null, null, null, '2026-08-26 17:03:30+00'),
  ('d3a0c003-0004-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000004', 7, 'assistant',
   $d$Noted: the teacher's involved and Sam says it's stopped, but he's quieter. Does he still join in with friends, at break time or clubs, the way he did?$d$,
   null, 4640, 43, 1560, '2026-08-26 17:03:34+00'),
  ('d3a0c003-0004-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000004', 8, 'patient',
   $d$He has two good friends and he's fine with them. He's stopped wanting to do football club though, which he loved. Says he's 'not bothered' but I think it's the other boys.$d$,
   'text', null, null, null, '2026-08-26 17:04:45+00'),
  ('d3a0c003-0004-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000004', 9, 'assistant',
   $d$That's helpful. Let's talk about eating and speaking, since those can go along with a cleft. How is Sam getting on with eating and drinking?$d$,
   null, 4870, 38, 1500, '2026-08-26 17:04:49+00'),
  ('d3a0c003-0004-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000004', 10, 'patient',
   $d$Eating's fine. Drinking sometimes comes out of his nose if he laughs while drinking. He finds that funny more than anything.$d$,
   'text', null, null, null, '2026-08-26 17:05:40+00'),
  ('d3a0c003-0004-4000-8000-000000000011', 'd3a0c002-0000-4000-8000-000000000004', 11, 'assistant',
   $d$Good to know it's not distressing him. And speech: do people outside the family understand him?$d$,
   null, 5060, 24, 1320, '2026-08-26 17:05:43+00'),
  ('d3a0c003-0004-4000-8000-000000000012', 'd3a0c002-0000-4000-8000-000000000004', 12, 'patient',
   $d$His speech is a bit nasal. Family understand him fine. New people sometimes ask him to repeat. He had speech therapy till last year. He hates reading out loud in class.$d$,
   'text', null, null, null, '2026-08-26 17:06:50+00'),
  ('d3a0c003-0004-4000-8000-000000000013', 'd3a0c002-0000-4000-8000-000000000004', 13, 'assistant',
   $d$Thank you. Last thing: the lip revision that's planned. How does Sam feel about it, and what are you hoping it will do?$d$,
   null, 5290, 33, 1440, '2026-08-26 17:06:54+00'),
  ('d3a0c003-0004-4000-8000-000000000014', 'd3a0c002-0000-4000-8000-000000000004', 14, 'patient',
   $d$He's nervous about the hospital but he wants it. I just want him to stop noticing it, and the scar to be flatter. I'm not expecting miracles. Is it normal for kids his age to suddenly get self-conscious like this?$d$,
   'text', null, null, null, '2026-08-26 17:08:10+00'),
  ('d3a0c003-0004-4000-8000-000000000015', 'd3a0c002-0000-4000-8000-000000000004', 15, 'assistant',
   $d$That's a question I'll pass to Sam's team rather than answer myself; it's a good one to ask them. Here's what I've heard: Sam has recently started asking why his lip looks different; a classmate called him a name a couple of times, which upset him; the teacher is involved and it seems to have stopped, but he's quieter about school and has dropped football club; he's fine with his two close friends; eating is fine, drinks sometimes come out of his nose but it doesn't bother him; his speech is a bit nasal and he avoids reading aloud; he's nervous but wants the operation, and you're hoping for a flatter scar and for him to notice it less. Did I get this right?$d$,
   null, 5600, 151, 2620, '2026-08-26 17:08:17+00'),
  ('d3a0c003-0004-4000-8000-000000000016', 'd3a0c002-0000-4000-8000-000000000004', 16, 'patient',
   $d$Yes, that's all right.$d$,
   'text', null, null, null, '2026-08-26 17:08:50+00');

insert into public.construct_evidence (id, session_id, construct_id, message_id, patient_quote, quote_gloss_en, severity, confidence, interference, note, created_at) values
  ('d3a0c004-0004-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000004', 'appearance.overall', 'd3a0c003-0004-4000-8000-000000000002',
   $d$He doesn't talk about it much at home. But since he moved up a year at school he's started asking why his lip looks different.$d$, $d$He doesn't talk about it much at home. But since he moved up a year at school he's started asking why his lip looks different.$d$,
   'mild', 0.70, '{}', 'Guardian report. Emerging awareness since school-year change.', '2026-08-26 17:01:07+00'),
  ('d3a0c004-0004-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000004', 'appearance.lips', 'd3a0c003-0004-4000-8000-000000000002',
   $d$he's started asking why his lip looks different$d$, $d$he's started asking why his lip looks different$d$,
   'mild', 0.70, '{}', 'Guardian report.', '2026-08-26 17:01:07+00'),
  ('d3a0c004-0004-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000004', 'social.teasing_comments', 'd3a0c003-0004-4000-8000-000000000004',
   $d$a boy in his class called him 'wonky lip'. He cried at bedtime.$d$, $d$a boy in his class called him 'wonky lip'. He cried at bedtime.$d$,
   'moderate', 0.90, '{school}', 'Guardian report. Name-calling by one classmate, a couple of times; caused visible upset.', '2026-08-26 17:02:22+00'),
  ('d3a0c004-0004-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000004', 'appearance.lips', 'd3a0c003-0004-4000-8000-000000000004',
   $d$More upset lately.$d$, $d$More upset lately.$d$,
   'moderate', 0.75, '{}', 'Guardian report. Lip appearance now a source of upset after teasing.', '2026-08-26 17:02:22+00'),
  ('d3a0c004-0004-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000004', 'psych.mood', 'd3a0c003-0004-4000-8000-000000000004',
   $d$He cried at bedtime. That's the first time I've seen him cry about it.$d$, $d$He cried at bedtime. That's the first time I've seen him cry about it.$d$,
   'mild', 0.70, '{}', 'Guardian report. Single recent episode of tears; no wider mood change described.', '2026-08-26 17:02:22+00'),
  ('d3a0c004-0004-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000004', 'social.school', 'd3a0c003-0004-4000-8000-000000000006',
   $d$Sam says it's stopped but he's gone a bit quiet about school.$d$, $d$Sam says it's stopped but he's gone a bit quiet about school.$d$,
   'mild', 0.65, '{school}', 'Guardian report. Attending; quieter about school since the incident; teacher engaged.', '2026-08-26 17:03:32+00'),
  ('d3a0c004-0004-4000-8000-000000000007', 'd3a0c002-0000-4000-8000-000000000004', 'social.comfort', 'd3a0c003-0004-4000-8000-000000000008',
   $d$He has two good friends and he's fine with them.$d$, $d$He has two good friends and he's fine with them.$d$,
   'none', 0.80, '{}', 'Guardian report. Comfortable with close friends.', '2026-08-26 17:04:47+00'),
  ('d3a0c004-0004-4000-8000-000000000008', 'd3a0c002-0000-4000-8000-000000000004', 'social.avoidance', 'd3a0c003-0004-4000-8000-000000000008',
   $d$He's stopped wanting to do football club though, which he loved.$d$, $d$He's stopped wanting to do football club though, which he loved.$d$,
   'moderate', 0.75, '{social,school}', 'Guardian report. Dropped a valued activity; guardian attributes it to peers, child denies.', '2026-08-26 17:04:47+00'),
  ('d3a0c004-0004-4000-8000-000000000009', 'd3a0c002-0000-4000-8000-000000000004', 'psych.self_confidence', 'd3a0c003-0004-4000-8000-000000000008',
   $d$Says he's 'not bothered' but I think it's the other boys.$d$, $d$Says he's 'not bothered' but I think it's the other boys.$d$,
   'mild', 0.55, '{}', 'Guardian inference only; child not asked directly. Needs clarification.', '2026-08-26 17:04:47+00'),
  ('d3a0c004-0004-4000-8000-000000000010', 'd3a0c002-0000-4000-8000-000000000004', 'function.eating_drinking', 'd3a0c003-0004-4000-8000-000000000010',
   $d$Eating's fine. Drinking sometimes comes out of his nose if he laughs while drinking.$d$, $d$Eating's fine. Drinking sometimes comes out of his nose if he laughs while drinking.$d$,
   'mild', 0.85, '{}', 'Guardian report. Occasional nasal regurgitation of liquids; not distressing to the child.', '2026-08-26 17:05:42+00'),
  ('d3a0c004-0004-4000-8000-000000000011', 'd3a0c002-0000-4000-8000-000000000004', 'function.speaking', 'd3a0c003-0004-4000-8000-000000000012',
   $d$His speech is a bit nasal. Family understand him fine. New people sometimes ask him to repeat.$d$, $d$His speech is a bit nasal. Family understand him fine. New people sometimes ask him to repeat.$d$,
   'moderate', 0.80, '{school}', 'Guardian report. Nasal resonance; intelligibility reduced with strangers; avoids reading aloud; therapy ended last year.', '2026-08-26 17:06:52+00'),
  ('d3a0c004-0004-4000-8000-000000000012', 'd3a0c002-0000-4000-8000-000000000004', 'adverse.scarring', 'd3a0c003-0004-4000-8000-000000000014',
   $d$I just want him to stop noticing it, and the scar to be flatter.$d$, $d$I just want him to stop noticing it, and the scar to be flatter.$d$,
   'mild', 0.60, '{}', 'Guardian report. Scar noticed by child; guardian wants it flatter.', '2026-08-26 17:08:12+00'),
  ('d3a0c004-0004-4000-8000-000000000013', 'd3a0c002-0000-4000-8000-000000000004', 'distress.preoccupation', 'd3a0c003-0004-4000-8000-000000000014',
   $d$I just want him to stop noticing it$d$, $d$I just want him to stop noticing it$d$,
   'mild', 0.60, '{}', 'Guardian report. Child notices the lip; frequency of checking not explored.', '2026-08-26 17:08:12+00');

insert into public.probe_findings (id, session_id, construct_id, finding, category, message_id, created_at) values
  ('d3a0c005-0004-4000-8000-000000000001', 'd3a0c002-0000-4000-8000-000000000004', 'social.teasing_comments',
   'Started after Sam moved up a school year. One classmate, a couple of times. Teacher informed by email and has been responsive; Sam says it has stopped.', 'onset', 'd3a0c003-0004-4000-8000-000000000006', '2026-08-26 17:03:32+00'),
  ('d3a0c005-0004-4000-8000-000000000002', 'd3a0c002-0000-4000-8000-000000000004', 'social.teasing_comments',
   'Sam cried at bedtime after the name-calling (first time the guardian has seen him cry about his face) and has since gone quiet about school.', 'impact', 'd3a0c003-0004-4000-8000-000000000004', '2026-08-26 17:02:22+00'),
  ('d3a0c005-0004-4000-8000-000000000003', 'd3a0c002-0000-4000-8000-000000000004', 'social.avoidance',
   'Dropped football club, which he loved; says he is not bothered, but the guardian suspects it is because of the other boys.', 'impact', 'd3a0c003-0004-4000-8000-000000000008', '2026-08-26 17:04:47+00'),
  ('d3a0c005-0004-4000-8000-000000000004', 'd3a0c002-0000-4000-8000-000000000004', 'function.speaking',
   'Nasal speech; family understand him, strangers sometimes ask him to repeat; avoids reading aloud in class. Speech therapy ended last year.', 'impact', 'd3a0c003-0004-4000-8000-000000000012', '2026-08-26 17:06:52+00'),
  ('d3a0c005-0004-4000-8000-000000000005', 'd3a0c002-0000-4000-8000-000000000004', 'adverse.scarring',
   'Sam is nervous about the hospital but wants the revision. Guardian hopes for a flatter scar and for Sam to notice it less; not expecting miracles.', 'expectation', 'd3a0c003-0004-4000-8000-000000000014', '2026-08-26 17:08:12+00'),
  ('d3a0c005-0004-4000-8000-000000000006', 'd3a0c002-0000-4000-8000-000000000004', 'appearance.overall',
   'Guardian asked whether it is normal for children this age to suddenly become self-conscious. Not answered clinically; passed to the team.', 'patient_question', 'd3a0c003-0004-4000-8000-000000000014', '2026-08-26 17:08:12+00');

insert into public.session_profiles (session_id, profile, patient_summary, patient_summary_confirmed_at, patient_corrections, generated_at) values
  ('d3a0c002-0000-4000-8000-000000000004',
   $d${
  "generated_with": {"model": "claude-sonnet-5", "prompt_version": "demo-seed-1", "map": "face-q-pediatric@2"},
  "respondent": "guardian",
  "domains": [
    {
      "id": "appearance", "label": "Satisfaction with facial appearance",
      "severity": "moderate", "confidence": 0.72,
      "summary_en": "Guardian report. Sam has recently become aware of his lip looking different and is more upset about it since a classmate's name-calling. Worst: lips, moderate.",
      "constructs": [
        {"id": "appearance.overall", "severity": "mild", "confidence": 0.70,
         "quotes": [{"text": "He doesn't talk about it much at home. But since he moved up a year at school he's started asking why his lip looks different.", "lang": "en", "gloss_en": "He doesn't talk about it much at home. But since he moved up a year at school he's started asking why his lip looks different."}],
         "findings": [], "status": "covered"},
        {"id": "appearance.lips", "severity": "moderate", "confidence": 0.75,
         "quotes": [
           {"text": "he's started asking why his lip looks different", "lang": "en", "gloss_en": "he's started asking why his lip looks different"},
           {"text": "More upset lately.", "lang": "en", "gloss_en": "More upset lately."}
         ],
         "findings": [], "status": "drill_down_pending"}
      ]
    },
    {
      "id": "psychological", "label": "Psychological function",
      "severity": "mild", "confidence": 0.62,
      "summary_en": "Guardian report. One recent episode of tears at bedtime; no wider mood change described. Confidence is a guardian inference only and needs clarification with Sam.",
      "constructs": [
        {"id": "psych.mood", "severity": "mild", "confidence": 0.70,
         "quotes": [{"text": "He cried at bedtime. That's the first time I've seen him cry about it.", "lang": "en", "gloss_en": "He cried at bedtime. That's the first time I've seen him cry about it."}],
         "findings": [], "status": "covered"},
        {"id": "psych.self_confidence", "severity": "mild", "confidence": 0.55,
         "quotes": [{"text": "Says he's 'not bothered' but I think it's the other boys.", "lang": "en", "gloss_en": "Says he's 'not bothered' but I think it's the other boys."}],
         "findings": [], "status": "needs_clarification"}
      ]
    },
    {
      "id": "social", "label": "Social function",
      "severity": "moderate", "confidence": 0.78,
      "summary_en": "Guardian report. Name-called by one classmate; teacher involved and it appears to have stopped, but Sam is quieter about school and has dropped football club. Comfortable with two close friends. Worst: teasing, moderate.",
      "constructs": [
        {"id": "social.teasing_comments", "severity": "moderate", "confidence": 0.90,
         "quotes": [{"text": "a boy in his class called him 'wonky lip'. He cried at bedtime.", "lang": "en", "gloss_en": "a boy in his class called him 'wonky lip'. He cried at bedtime."}],
         "findings": [
           {"category": "onset", "text": "Started after Sam moved up a school year. One classmate, a couple of times. Teacher informed by email and has been responsive; Sam says it has stopped."},
           {"category": "impact", "text": "Sam cried at bedtime after the name-calling (first time the guardian has seen him cry about his face) and has since gone quiet about school."}
         ],
         "status": "drill_down_done"},
        {"id": "social.avoidance", "severity": "moderate", "confidence": 0.75,
         "quotes": [{"text": "He's stopped wanting to do football club though, which he loved.", "lang": "en", "gloss_en": "He's stopped wanting to do football club though, which he loved."}],
         "findings": [{"category": "impact", "text": "Dropped football club, which he loved; says he is not bothered, but the guardian suspects it is because of the other boys."}],
         "status": "drill_down_done"},
        {"id": "social.school", "severity": "mild", "confidence": 0.65,
         "quotes": [{"text": "Sam says it's stopped but he's gone a bit quiet about school.", "lang": "en", "gloss_en": "Sam says it's stopped but he's gone a bit quiet about school."}],
         "findings": [], "status": "covered"},
        {"id": "social.comfort", "severity": "none", "confidence": 0.80,
         "quotes": [{"text": "He has two good friends and he's fine with them.", "lang": "en", "gloss_en": "He has two good friends and he's fine with them."}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "distress", "label": "Appearance-related distress",
      "severity": "mild", "confidence": 0.60,
      "summary_en": "Guardian report. Sam notices the lip; how often he checks or worries was not explored. Hiding not discussed.",
      "constructs": [
        {"id": "distress.preoccupation", "severity": "mild", "confidence": 0.60,
         "quotes": [{"text": "I just want him to stop noticing it", "lang": "en", "gloss_en": "I just want him to stop noticing it"}],
         "findings": [], "status": "covered"}
      ]
    },
    {
      "id": "function", "label": "Facial function",
      "severity": "mild", "confidence": 0.82,
      "summary_en": "Guardian report. Eating fine; occasional nasal regurgitation of drinks when laughing, not distressing. Speech nasal, strangers sometimes ask him to repeat, avoids reading aloud. Worst: speaking, moderate.",
      "constructs": [
        {"id": "function.eating_drinking", "severity": "mild", "confidence": 0.85,
         "quotes": [{"text": "Eating's fine. Drinking sometimes comes out of his nose if he laughs while drinking.", "lang": "en", "gloss_en": "Eating's fine. Drinking sometimes comes out of his nose if he laughs while drinking."}],
         "findings": [], "status": "covered"},
        {"id": "function.speaking", "severity": "moderate", "confidence": 0.80,
         "quotes": [{"text": "His speech is a bit nasal. Family understand him fine. New people sometimes ask him to repeat.", "lang": "en", "gloss_en": "His speech is a bit nasal. Family understand him fine. New people sometimes ask him to repeat."}],
         "findings": [{"category": "impact", "text": "Nasal speech; family understand him, strangers sometimes ask him to repeat; avoids reading aloud in class. Speech therapy ended last year."}],
         "status": "drill_down_done"}
      ]
    },
    {
      "id": "adverse", "label": "Adverse effects and symptoms",
      "severity": "mild", "confidence": 0.60,
      "summary_en": "Guardian report. Existing lip scar is noticed by Sam; guardian hopes the revision will flatten it. Pain not discussed (pre-operative).",
      "constructs": [
        {"id": "adverse.scarring", "severity": "mild", "confidence": 0.60,
         "quotes": [{"text": "I just want him to stop noticing it, and the scar to be flatter.", "lang": "en", "gloss_en": "I just want him to stop noticing it, and the scar to be flatter."}],
         "findings": [{"category": "expectation", "text": "Sam is nervous about the hospital but wants the revision. Guardian hopes for a flatter scar and for Sam to notice it less; not expecting miracles."}],
         "status": "covered"}
      ]
    }
  ],
  "needs_clarification": [
    {"construct_id": "psych.self_confidence", "reason": "Guardian inference only; Sam has not been asked directly."}
  ],
  "not_covered": ["appearance.nose", "appearance.smile_teeth", "function.breathing", "adverse.pain_discomfort"],
  "declined": [],
  "patient_questions": ["Is it normal for children Sam's age to suddenly become self-conscious about their face? (asked by guardian)"],
  "change_from_prior": [],
  "disclaimer": "AI-assisted inferred profile. Not a validated FACE-Q score."
}$d$::jsonb,
   $d$Here is what I heard about Sam today:
- His face: since moving up a year he has started asking why his lip looks different, and lately it upsets him more.
- School and friends: a classmate called him a name a couple of times. You told his teacher and it seems to have stopped, but he is quieter about school and has stopped football club. He is happy with his two close friends.
- Eating and talking: eating is fine; drinks sometimes come out of his nose when he laughs. His speech is a bit nasal, new people sometimes ask him to repeat, and he hates reading aloud.
- The operation: he is nervous but wants it. You hope for a flatter scar and that he notices it less. Your question about self-consciousness goes to his team.
Did I get this right? You can correct anything.$d$,
   '2026-08-26 17:12:05+00', null, '2026-08-26 17:09:40+00');

-- ===========================================================================
-- Audit trail for the fixtures themselves (study_id only, per SPEC §13)
-- ===========================================================================
insert into public.audit_log (actor_type, actor_id, action, target_type, target_id, metadata)
select 'system', 'demo.sql', 'demo_participant_seeded', 'participant', p.study_id,
       jsonb_build_object('is_demo', true, 'diagnosis_code', p.diagnosis_code)
from public.participants p
where p.id in (
  'd3a0c001-0000-4000-8000-000000000001',
  'd3a0c001-0000-4000-8000-000000000002',
  'd3a0c001-0000-4000-8000-000000000003'
);

commit;
