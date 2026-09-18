import type {
  ClinicianNoteRow,
  ConstructEvidenceRow,
  MessageRow,
  Participant,
  ProbeFindingRow,
  Profile,
  SafetyFlagRow,
  SessionPhase,
  SessionProfileRow,
  SessionRow,
  Severity,
} from '../../types'

// Synthetic demo data mirroring SPEC §13: no real names, no PHI.

export interface MockStore {
  participants: Participant[]
  sessions: SessionRow[]
  messages: MessageRow[]
  evidence: ConstructEvidenceRow[]
  findings: ProbeFindingRow[]
  profiles: SessionProfileRow[]
  safety_flags: SafetyFlagRow[]
  clinician_notes: ClinicianNoteRow[]
  /** token → session id (mock only; real backend stores a hash) */
  tokens: Record<string, string>
  /** map id → status overrides / drafts created through ingest */
  draftMaps: import('../../types').ConstructMapRow[]
  /** mock engine state: next scripted turn per session, and constructs the last assistant message asked about */
  scriptPos: Record<string, number>
  lastAsks: Record<string, string[]>
  /** mock tracker state (v1.1 §B): phase, the construct being explored, and confirmed focuses */
  convo: Record<string, ConvoState>
}

export interface ConvoState {
  phase: SessionPhase
  current_focus: string | null
  confirmed: string[]
}

const DISCLAIMER = 'AI-assisted inferred profile. Not a validated FACE-Q score.'
const GEN = { model: 'claude-sonnet-5', prompt_version: 'v1.0.0', map: 'face-q-adult@1' }

const session = (
  id: string,
  participant_id: string,
  timepoint: SessionRow['timepoint'],
  respondent: SessionRow['respondent'],
  language: SessionRow['language'],
  construct_map_id: string,
  status: SessionRow['status'],
  day: string,
  consent_variant: SessionRow['consent_variant'] = 'adult',
): SessionRow => ({
  id,
  participant_id,
  timepoint,
  respondent,
  language,
  construct_map_id,
  prompt_version: 'v1.0.0',
  model_id: 'claude-sonnet-5',
  status,
  max_turns: 40,
  target_minutes: 12,
  started_at: `${day}T10:02:00Z`,
  ended_at: status === 'completed' ? `${day}T10:14:00Z` : null,
  consent_given_at: `${day}T10:01:00Z`,
  consent_variant,
  input_tokens: 18420,
  output_tokens: 2210,
  cost_usd_estimate: 0.09,
  created_at: `${day}T10:00:00Z`,
})

let seqCounter = 0
const msg = (
  session_id: string,
  role: MessageRow['role'],
  content: string,
  input_mode: MessageRow['input_mode'] = null,
): MessageRow => {
  seqCounter += 1
  return {
    id: `${session_id}-m${seqCounter}`,
    session_id,
    seq: seqCounter,
    role,
    content,
    input_mode,
    tokens_in: role === 'assistant' ? 1500 : null,
    tokens_out: role === 'assistant' ? 90 : null,
    latency_ms: role === 'assistant' ? 1800 : null,
    created_at: `2026-09-01T10:${String(seqCounter).padStart(2, '0')}:00Z`,
  }
}

const ev = (
  session_id: string,
  construct_id: string,
  message_id: string,
  patient_quote: string,
  quote_gloss_en: string,
  severity: Severity,
  confidence: number,
  interference: ConstructEvidenceRow['interference'] = [],
  note: string | null = null,
  facets: string[] = [],
  triage_item: string | null = null,
): ConstructEvidenceRow => ({
  id: `${session_id}-ev-${construct_id}-${Math.round(confidence * 100)}`,
  session_id,
  construct_id,
  message_id,
  patient_quote,
  quote_gloss_en,
  severity,
  confidence,
  interference,
  facets,
  triage_item,
  note,
  superseded_by: null,
  created_at: '2026-09-01T10:05:00Z',
})

const pf = (
  session_id: string,
  construct_id: string,
  category: ProbeFindingRow['category'],
  finding: string,
  message_id: string | null = null,
): ProbeFindingRow => ({
  id: `${session_id}-pf-${construct_id}-${category}`,
  session_id,
  construct_id,
  finding,
  category,
  message_id,
  created_at: '2026-09-01T10:06:00Z',
})

// ---------------- Participants ----------------

export const P1: Participant = {
  id: 'p-0001',
  study_id: 'P-0001',
  display_name: 'Sam',
  preferred_language: 'en',
  age_band: '30-49',
  reading_comfort: 'comfortable',
  diagnosis_code: 'rhinoplasty',
  diagnosis_text: 'Rhinoplasty (functional + cosmetic)',
  is_demo: true,
  deleted_at: null,
  created_at: '2026-08-20T09:00:00Z',
}
export const P2: Participant = {
  id: 'p-0002',
  study_id: 'P-0002',
  display_name: 'Lucía',
  preferred_language: 'es',
  age_band: '50-69',
  reading_comfort: 'short-messages',
  diagnosis_code: 'facelift',
  diagnosis_text: 'Lifting facial y de cuello',
  is_demo: true,
  deleted_at: null,
  created_at: '2026-08-22T09:00:00Z',
}
export const P3: Participant = {
  id: 'p-0003',
  study_id: 'P-0003',
  display_name: 'Kai',
  preferred_language: 'en',
  age_band: '8-12',
  reading_comfort: 'short-messages',
  diagnosis_code: 'cleft-lip-palate',
  diagnosis_text: 'Unilateral cleft lip and palate, lip revision planned',
  is_demo: true,
  deleted_at: null,
  created_at: '2026-08-25T09:00:00Z',
}

// ---------------- P1 baseline ----------------

const S1 = session('s-0001-baseline', P1.id, 'baseline', 'self', 'en', 'map-adult-1', 'completed', '2026-08-20')
const S1m = [
  msg(S1.id, 'assistant', "Hi Sam, thanks for taking the time. There's no right or wrong here; I'd just like to hear how things are for you at the moment. How do you feel about your face these days?"),
  msg(S1.id, 'patient', "Honestly the nose is the whole reason I'm here. It's been bugging me since I was a teenager. From the front it's fine but the bump on the side profile makes me hate photos.", 'text'),
  msg(S1.id, 'assistant', 'That makes sense, and it sounds like it has been on your mind a long time. When you say you hate photos, what do you usually do when someone wants to take one?'),
  msg(S1.id, 'patient', "I turn straight on to the camera, or I just avoid it. At my sister's wedding I ducked out of most of the group shots.", 'text'),
  msg(S1.id, 'assistant', "Thanks for sharing that. Does thinking about your nose come up in other moments too, like meeting new people or at work?"),
  msg(S1.id, 'patient', "Meeting people, yes, I catch myself wondering if they're looking at it. Work is fine, mostly video calls and I know my angles.", 'text'),
  msg(S1.id, 'assistant', 'And how is breathing through your nose, day to day and when you exercise?'),
  msg(S1.id, 'patient', "Left side is blocked most of the time. I'm a mouth breather at night, my partner says I snore.", 'voice'),
  msg(S1.id, 'assistant', "Got it. Last thing for now: what do you hope will be different after surgery?"),
  msg(S1.id, 'patient', 'A straight profile, and to actually breathe. I am not expecting a movie-star nose.', 'text'),
]
const S1ev = [
  ev(S1.id, 'appearance.nose', S1m[1].id, 'the bump on the side profile makes me hate photos', 'the bump on the side profile makes me hate photos', 'severe', 0.9, ['social'], 'Long-standing, profile-specific', ['profile', 'photos_vs_mirror', 'since_when']),
  ev(S1.id, 'appearance.overall', S1m[1].id, 'From the front it\'s fine', 'From the front it\'s fine', 'mild', 0.7, [], null, ['features'], 'overall'),
  ev(S1.id, 'appearance.nose', S1m[1].id, 'the nose is the whole reason I\'m here', 'the nose is the whole reason I\'m here', 'severe', 0.8, [], 'named during the opening screen', [], 'features'),
  ev(S1.id, 'social.confidence', S1m[3].id, "I ducked out of most of the group shots", "I ducked out of most of the group shots", 'moderate', 0.85, ['social', 'relationships'], null, [], 'impact'),
  ev(S1.id, 'psych.self_consciousness', S1m[5].id, "I catch myself wondering if they're looking at it", "I catch myself wondering if they're looking at it", 'moderate', 0.8, ['social'], null, ['when_strongest', 'frequency']),
  ev(S1.id, 'function.breathing', S1m[7].id, 'Left side is blocked most of the time', 'Left side is blocked most of the time', 'severe', 0.9, ['sleep'], null, ['which_side', 'daytime', 'sleep'], 'function'),
]
const S1pf = [
  pf(S1.id, 'appearance.nose', 'onset', 'Since teenage years', S1m[1].id),
  pf(S1.id, 'appearance.nose', 'triggers', 'Side-profile photos; group photos', S1m[3].id),
  pf(S1.id, 'appearance.nose', 'expectation', 'Straight profile; realistic expectations stated', S1m[9].id),
  pf(S1.id, 'function.breathing', 'impact', 'Mouth breathing at night; partner reports snoring', S1m[7].id),
]
const S1profile: Profile = {
  generated_with: GEN,
  domains: [
    {
      id: 'appearance', label: 'Satisfaction with facial appearance', severity: 'moderate', confidence: 0.8,
      summary_en: 'Strong, long-standing dissatisfaction with the nasal profile; otherwise broadly content with facial appearance.',
      constructs: [
        { id: 'appearance.nose', severity: 'severe', confidence: 0.9, status: 'drill_down_done',
          facets_covered: ['profile', 'photos_vs_mirror', 'since_when', 'wanted_change'], facets_missing: ['shape', 'symmetry', 'others_comments'], confirmed: true,
          quotes: [{ text: 'the bump on the side profile makes me hate photos', lang: 'en', gloss_en: 'the bump on the side profile makes me hate photos' }],
          findings: [{ category: 'onset', text: 'Since teenage years' }, { category: 'triggers', text: 'Side-profile photos; group photos' }, { category: 'expectation', text: 'Straight profile; realistic expectations stated' }] },
        { id: 'appearance.overall', severity: 'mild', confidence: 0.7, status: 'covered',
          facets_covered: ['features'], facets_missing: ['mirror_vs_photos', 'age_fit', 'since_when', 'wanted_change'], confirmed: false,
          quotes: [{ text: "From the front it's fine", lang: 'en', gloss_en: "From the front it's fine" }], findings: [] },
      ],
    },
    {
      id: 'psychological', label: 'Psychological function', severity: 'moderate', confidence: 0.8,
      summary_en: 'Frequent self-consciousness when meeting new people.',
      constructs: [
        { id: 'psych.self_consciousness', severity: 'moderate', confidence: 0.8, status: 'covered',
          facets_covered: ['when_strongest', 'frequency'], facets_missing: ['avoidance', 'since_when', 'what_helps'], confirmed: false,
          quotes: [{ text: "I catch myself wondering if they're looking at it", lang: 'en', gloss_en: "I catch myself wondering if they're looking at it" }], findings: [] },
      ],
    },
    {
      id: 'social', label: 'Social function', severity: 'moderate', confidence: 0.85,
      summary_en: 'Avoids group photos at family events; work unaffected.',
      constructs: [
        { id: 'social.confidence', severity: 'moderate', confidence: 0.85, status: 'covered',
          quotes: [{ text: 'I ducked out of most of the group shots', lang: 'en', gloss_en: 'I ducked out of most of the group shots' }], findings: [] },
      ],
    },
    {
      id: 'function', label: 'Facial function', severity: 'severe', confidence: 0.9,
      summary_en: 'Left-sided nasal obstruction with nocturnal mouth breathing.',
      constructs: [
        { id: 'function.breathing', severity: 'severe', confidence: 0.9, status: 'drill_down_done',
          facets_covered: ['which_side', 'daytime', 'sleep', 'since_when'], facets_missing: ['exercise', 'what_helps'], confirmed: true,
          quotes: [{ text: 'Left side is blocked most of the time', lang: 'en', gloss_en: 'Left side is blocked most of the time' }],
          findings: [{ category: 'impact', text: 'Mouth breathing at night; partner reports snoring' }] },
      ],
    },
  ],
  needs_clarification: [{ construct_id: 'psych.distress', reason: 'Mentioned "hate photos" but no direct statement about mood; confidence below threshold.' }],
  not_covered: ['appearance.skin', 'outcome.decision'],
  declined: [],
  patient_questions: [],
  change_from_prior: [],
  disclaimer: DISCLAIMER,
}

// ---------------- P1 post-op 6 weeks ----------------

const S2 = session('s-0001-postop6w', P1.id, 'post-op-6w', 'self', 'en', 'map-adult-1', 'completed', '2026-09-01')
const S2m = [
  msg(S2.id, 'assistant', "Welcome back, Sam. Last time you told me the bump on your profile was the main thing, and that breathing on the left was hard. It's been about six weeks since surgery; how are things now?"),
  msg(S2.id, 'patient', 'Way better. The profile is straight, I keep catching it in shop windows and smiling. Still puffy at the tip though.', 'text'),
  msg(S2.id, 'assistant', "That's lovely to hear. The puffiness at the tip, is it bothering you much, or more just something you notice?"),
  msg(S2.id, 'patient', 'Just something I notice. They said it takes months. The numbness at the tip is weirder, like touching someone else\'s nose.', 'voice'),
  msg(S2.id, 'assistant', 'Thanks. And breathing, has the left side changed?'),
  msg(S2.id, 'patient', 'Night and day. I sleep with my mouth closed now. Is it normal that it still whistles a bit when I breathe in hard?', 'text'),
  msg(S2.id, 'assistant', "I can't answer that one clinically, but I've noted it so your care team can talk it through with you. How do you feel about photos and meeting people these days?"),
  msg(S2.id, 'patient', "I posed for a side-profile photo last week on purpose. Still a bit self-conscious about the swelling but nothing like before.", 'text'),
  msg(S2.id, 'assistant', 'Looking back, how do you feel about the decision to go ahead?'),
  msg(S2.id, 'patient', "No regrets. Wish I'd done it ten years ago.", 'text'),
]
const S2ev = [
  ev(S2.id, 'appearance.nose', S2m[1].id, 'The profile is straight, I keep catching it in shop windows and smiling', 'The profile is straight, I keep catching it in shop windows and smiling', 'none', 0.9),
  ev(S2.id, 'adverse.swelling_bruising', S2m[3].id, 'Just something I notice', 'Just something I notice', 'mild', 0.8),
  ev(S2.id, 'adverse.numbness', S2m[3].id, "like touching someone else's nose", "like touching someone else's nose", 'mild', 0.75),
  ev(S2.id, 'function.breathing', S2m[5].id, 'I sleep with my mouth closed now', 'I sleep with my mouth closed now', 'none', 0.9),
  ev(S2.id, 'social.confidence', S2m[7].id, 'I posed for a side-profile photo last week on purpose', 'I posed for a side-profile photo last week on purpose', 'none', 0.85),
  ev(S2.id, 'psych.self_consciousness', S2m[7].id, 'Still a bit self-conscious about the swelling', 'Still a bit self-conscious about the swelling', 'mild', 0.8),
  ev(S2.id, 'outcome.decision', S2m[9].id, "No regrets. Wish I'd done it ten years ago.", "No regrets. Wish I'd done it ten years ago.", 'none', 0.95),
]
const S2pf = [
  pf(S2.id, 'adverse.swelling_bruising', 'trajectory', 'Tip swelling persisting at 6 weeks; patient informed it takes months', S2m[3].id),
  pf(S2.id, 'function.breathing', 'patient_question', 'Asked whether a whistling sound on forceful inhalation is normal', S2m[5].id),
]
const S2profile: Profile = {
  generated_with: GEN,
  domains: [
    {
      id: 'appearance', label: 'Satisfaction with facial appearance', severity: 'none', confidence: 0.9,
      summary_en: 'Very satisfied with the new profile.',
      constructs: [{ id: 'appearance.nose', severity: 'none', confidence: 0.9, status: 'covered',
        quotes: [{ text: 'The profile is straight, I keep catching it in shop windows and smiling', lang: 'en', gloss_en: 'The profile is straight, I keep catching it in shop windows and smiling' }], findings: [] }],
    },
    {
      id: 'psychological', label: 'Psychological function', severity: 'mild', confidence: 0.8,
      summary_en: 'Residual self-consciousness limited to swelling.',
      constructs: [{ id: 'psych.self_consciousness', severity: 'mild', confidence: 0.8, status: 'covered',
        quotes: [{ text: 'Still a bit self-conscious about the swelling', lang: 'en', gloss_en: 'Still a bit self-conscious about the swelling' }], findings: [] }],
    },
    {
      id: 'social', label: 'Social function', severity: 'none', confidence: 0.85,
      summary_en: 'Now volunteers for profile photos.',
      constructs: [{ id: 'social.confidence', severity: 'none', confidence: 0.85, status: 'covered',
        quotes: [{ text: 'I posed for a side-profile photo last week on purpose', lang: 'en', gloss_en: 'I posed for a side-profile photo last week on purpose' }], findings: [] }],
    },
    {
      id: 'function', label: 'Facial function', severity: 'none', confidence: 0.9,
      summary_en: 'Nasal breathing resolved; asked about a whistling sound.',
      constructs: [{ id: 'function.breathing', severity: 'none', confidence: 0.9, status: 'covered',
        quotes: [{ text: 'I sleep with my mouth closed now', lang: 'en', gloss_en: 'I sleep with my mouth closed now' }],
        findings: [{ category: 'patient_question', text: 'Asked whether a whistling sound on forceful inhalation is normal' }] }],
    },
    {
      id: 'adverse', label: 'Adverse effects', severity: 'mild', confidence: 0.78,
      summary_en: 'Mild tip swelling and numbness, both tolerated.',
      constructs: [
        { id: 'adverse.swelling_bruising', severity: 'mild', confidence: 0.8, status: 'drill_down_done',
          quotes: [{ text: 'Just something I notice', lang: 'en', gloss_en: 'Just something I notice' }],
          findings: [{ category: 'trajectory', text: 'Tip swelling persisting at 6 weeks; patient informed it takes months' }] },
        { id: 'adverse.numbness', severity: 'mild', confidence: 0.75, status: 'covered',
          quotes: [{ text: "like touching someone else's nose", lang: 'en', gloss_en: "like touching someone else's nose" }], findings: [] },
      ],
    },
    {
      id: 'outcome', label: 'Satisfaction with outcome, decision and information', severity: 'none', confidence: 0.95,
      summary_en: 'No regrets about the decision.',
      constructs: [{ id: 'outcome.decision', severity: 'none', confidence: 0.95, status: 'covered',
        quotes: [{ text: "No regrets. Wish I'd done it ten years ago.", lang: 'en', gloss_en: "No regrets. Wish I'd done it ten years ago." }], findings: [] }],
    },
  ],
  needs_clarification: [],
  not_covered: ['appearance.skin', 'outcome.information'],
  declined: [],
  patient_questions: ['Is it normal that it still whistles a bit when I breathe in hard?'],
  change_from_prior: [
    { construct_id: 'appearance.nose', prior: 'severe', now: 'none', note: 'Profile concern resolved' },
    { construct_id: 'function.breathing', prior: 'severe', now: 'none', note: 'Sleeps with mouth closed' },
    { construct_id: 'social.confidence', prior: 'moderate', now: 'none', note: 'Volunteers for photos' },
    { construct_id: 'psych.self_consciousness', prior: 'moderate', now: 'mild', note: 'Now limited to swelling' },
  ],
  disclaimer: DISCLAIMER,
}

// ---------------- P2 baseline (es) ----------------

const S3 = session('s-0002-baseline', P2.id, 'baseline', 'self', 'es', 'map-adult-1', 'completed', '2026-08-22')
const S3m = [
  msg(S3.id, 'assistant', 'Hola Lucía, gracias por estar aquí. No hay respuestas buenas ni malas. ¿Cómo se siente con su cara últimamente?'),
  msg(S3.id, 'patient', 'Pues mire, me veo cansada. Las mejillas se me han caído y el cuello no me gusta nada.', 'voice'),
  msg(S3.id, 'assistant', 'Entiendo. ¿Hay momentos en los que lo nota más?'),
  msg(S3.id, 'patient', 'En las fotos con mis nietos. Salgo con cara de enfadada aunque esté contenta. Ya casi no me dejo hacer fotos.', 'voice'),
  msg(S3.id, 'assistant', 'Gracias por contármelo. ¿Y cuando está con otras personas, se siente cómoda?'),
  msg(S3.id, 'patient', 'Con la familia sí. Con gente nueva me pongo un pañuelo al cuello, siempre.', 'text'),
  msg(S3.id, 'assistant', '¿Diría que su cara se ve de la edad que tiene, o mayor?'),
  msg(S3.id, 'patient', 'Mayor. Diez años más, por lo menos. Y eso me pone triste, no se lo voy a negar.', 'voice'),
  msg(S3.id, 'assistant', 'Se lo agradezco. ¿Y la piel de la cara, cómo la siente?'),
  msg(S3.id, 'patient', 'Prefiero no hablar de eso ahora.', 'text'),
  msg(S3.id, 'assistant', 'Por supuesto, lo dejamos ahí. ¿Qué espera que cambie con la operación?'),
  msg(S3.id, 'patient', 'Verme descansada. No quiero parecer otra persona, solo yo con menos cansancio.', 'voice'),
]
const S3ev = [
  ev(S3.id, 'appearance.cheeks', S3m[1].id, 'Las mejillas se me han caído', 'My cheeks have dropped', 'moderate', 0.8, [], null, [], 'features'),
  ev(S3.id, 'appearance.jawline', S3m[1].id, 'el cuello no me gusta nada', "I don't like my neck at all", 'severe', 0.85),
  ev(S3.id, 'appearance.overall', S3m[3].id, 'Ya casi no me dejo hacer fotos', 'I hardly let anyone take photos of me any more', 'moderate', 0.85, ['social', 'relationships'], null, ['mirror_vs_photos'], 'overall'),
  ev(S3.id, 'social.confidence', S3m[5].id, 'Con gente nueva me pongo un pañuelo al cuello, siempre', 'With new people I always wear a scarf around my neck', 'moderate', 0.8, ['social'], null, [], 'impact'),
  ev(S3.id, 'age.appraisal', S3m[7].id, 'Mayor. Diez años más, por lo menos.', 'Older. Ten years more, at least.', 'severe', 0.9),
  ev(S3.id, 'psych.distress', S3m[7].id, 'eso me pone triste, no se lo voy a negar', "that makes me sad, I won't deny it", 'moderate', 0.8),
  ev(S3.id, 'appearance.skin', S3m[9].id, 'Prefiero no hablar de eso ahora.', "I'd rather not talk about that right now.", 'declined', 1),
]
const S3pf = [
  pf(S3.id, 'appearance.overall', 'triggers', 'Photos with grandchildren; feels she looks angry when happy', S3m[3].id),
  pf(S3.id, 'appearance.overall', 'expectation', 'Wants to look rested, not different', S3m[11].id),
  pf(S3.id, 'appearance.jawline', 'impact', 'Covers neck with a scarf around new people', S3m[5].id),
]
const S3profile: Profile = {
  generated_with: GEN,
  domains: [
    {
      id: 'appearance', label: 'Satisfaction with facial appearance', severity: 'moderate', confidence: 0.83,
      summary_en: 'Bothered by cheek descent and especially the neck; avoids photos with grandchildren.',
      constructs: [
        { id: 'appearance.overall', severity: 'moderate', confidence: 0.85, status: 'drill_down_done',
          quotes: [{ text: 'Ya casi no me dejo hacer fotos', lang: 'es', gloss_en: 'I hardly let anyone take photos of me any more' }],
          findings: [{ category: 'triggers', text: 'Photos with grandchildren; feels she looks angry when happy' }, { category: 'expectation', text: 'Wants to look rested, not different' }] },
        { id: 'appearance.cheeks', severity: 'moderate', confidence: 0.8, status: 'covered',
          quotes: [{ text: 'Las mejillas se me han caído', lang: 'es', gloss_en: 'My cheeks have dropped' }], findings: [] },
        { id: 'appearance.jawline', severity: 'severe', confidence: 0.85, status: 'drill_down_done',
          quotes: [{ text: 'el cuello no me gusta nada', lang: 'es', gloss_en: "I don't like my neck at all" }],
          findings: [{ category: 'impact', text: 'Covers neck with a scarf around new people' }] },
        { id: 'appearance.skin', severity: 'declined', confidence: 1, status: 'declined', quotes: [], findings: [] },
      ],
    },
    {
      id: 'psychological', label: 'Psychological function', severity: 'moderate', confidence: 0.8,
      summary_en: 'Sadness linked to looking older than she feels.',
      constructs: [{ id: 'psych.distress', severity: 'moderate', confidence: 0.8, status: 'covered',
        quotes: [{ text: 'eso me pone triste, no se lo voy a negar', lang: 'es', gloss_en: "that makes me sad, I won't deny it" }], findings: [] }],
    },
    {
      id: 'social', label: 'Social function', severity: 'moderate', confidence: 0.8,
      summary_en: 'Comfortable with family; conceals neck around strangers.',
      constructs: [{ id: 'social.confidence', severity: 'moderate', confidence: 0.8, status: 'covered',
        quotes: [{ text: 'Con gente nueva me pongo un pañuelo al cuello, siempre', lang: 'es', gloss_en: 'With new people I always wear a scarf around my neck' }], findings: [] }],
    },
    {
      id: 'age', label: 'Age appraisal', severity: 'severe', confidence: 0.9,
      summary_en: 'Feels she looks at least ten years older.',
      constructs: [{ id: 'age.appraisal', severity: 'severe', confidence: 0.9, status: 'covered',
        quotes: [{ text: 'Mayor. Diez años más, por lo menos.', lang: 'es', gloss_en: 'Older. Ten years more, at least.' }], findings: [] }],
    },
  ],
  needs_clarification: [{ construct_id: 'psych.self_consciousness', reason: 'Photo avoidance suggests self-consciousness but it was not stated directly.' }],
  not_covered: ['outcome.information'],
  declined: ['appearance.skin'],
  patient_questions: [],
  change_from_prior: [],
  disclaimer: DISCLAIMER,
}

// ---------------- P3 baseline (pediatric, guardian) ----------------

const S4 = session('s-0003-baseline', P3.id, 'baseline', 'guardian', 'en', 'map-ped-1', 'completed', '2026-08-25', 'guardian')
const S4m = [
  msg(S4.id, 'assistant', "Hi, thanks for joining with Kai. I'll keep this short and simple. How does Kai seem to feel about their face at the moment?"),
  msg(S4.id, 'patient', "Mostly fine at home. But since starting the new school he's gone quiet about it. He asked me last week why his lip is 'wonky'.", 'text'),
  msg(S4.id, 'assistant', 'Thank you. Has anyone at school said anything to him about it, that you know of?'),
  msg(S4.id, 'patient', "One boy called him a name. The teacher dealt with it, but he didn't want to go to football club the week after.", 'text'),
  msg(S4.id, 'assistant', "I'm sorry to hear that. How about talking, do people understand him okay?"),
  msg(S4.id, 'patient', 'Family yes. New people ask him to repeat himself and he hates that, he goes red.', 'voice'),
  msg(S4.id, 'assistant', 'And eating and drinking, any trouble there?'),
  msg(S4.id, 'patient', 'No, that\'s all fine now.', 'text'),
  msg(S4.id, 'assistant', 'Last one: how does he feel about the scar on his lip?'),
  msg(S4.id, 'patient', 'He picks at it when he is nervous. Says it feels tight in the cold.', 'text'),
]
const S4ev = [
  ev(S4.id, 'appearance.lips', S4m[1].id, "He asked me last week why his lip is 'wonky'", "He asked me last week why his lip is 'wonky'", 'moderate', 0.75),
  ev(S4.id, 'social.school', S4m[3].id, "he didn't want to go to football club the week after", "he didn't want to go to football club the week after", 'moderate', 0.85, ['school', 'social']),
  ev(S4.id, 'function.speaking', S4m[5].id, 'New people ask him to repeat himself and he hates that', 'New people ask him to repeat himself and he hates that', 'moderate', 0.8, ['social']),
  ev(S4.id, 'function.eating', S4m[7].id, "that's all fine now", "that's all fine now", 'none', 0.9),
  ev(S4.id, 'adverse.scarring', S4m[9].id, 'He picks at it when he is nervous. Says it feels tight in the cold.', 'He picks at it when he is nervous. Says it feels tight in the cold.', 'mild', 0.7),
]
const S4pf = [
  pf(S4.id, 'social.school', 'triggers', 'Name-calling by a peer at new school; avoided football club for a week', S4m[3].id),
  pf(S4.id, 'appearance.lips', 'onset', 'Became quiet about it after starting new school', S4m[1].id),
]
const S4profile: Profile = {
  generated_with: { ...GEN, map: 'face-q-pediatric@1' },
  domains: [
    {
      id: 'appearance', label: 'How the child feels about their face', severity: 'moderate', confidence: 0.75,
      summary_en: 'Recently started asking why his lip looks different (guardian report).',
      constructs: [{ id: 'appearance.lips', severity: 'moderate', confidence: 0.75, status: 'drill_down_done',
        quotes: [{ text: "He asked me last week why his lip is 'wonky'", lang: 'en', gloss_en: "He asked me last week why his lip is 'wonky'" }],
        findings: [{ category: 'onset', text: 'Became quiet about it after starting new school' }] }],
    },
    {
      id: 'social', label: 'Friends and school', severity: 'moderate', confidence: 0.85,
      summary_en: 'Teasing incident at new school with brief activity avoidance.',
      constructs: [{ id: 'social.school', severity: 'moderate', confidence: 0.85, status: 'drill_down_done',
        quotes: [{ text: "he didn't want to go to football club the week after", lang: 'en', gloss_en: "he didn't want to go to football club the week after" }],
        findings: [{ category: 'triggers', text: 'Name-calling by a peer at new school; avoided football club for a week' }] }],
    },
    {
      id: 'function', label: 'Talking and eating', severity: 'mild', confidence: 0.85,
      summary_en: 'Speech: understood by family, repeats for strangers. Eating unaffected.',
      constructs: [
        { id: 'function.speaking', severity: 'moderate', confidence: 0.8, status: 'covered',
          quotes: [{ text: 'New people ask him to repeat himself and he hates that', lang: 'en', gloss_en: 'New people ask him to repeat himself and he hates that' }], findings: [] },
        { id: 'function.eating', severity: 'none', confidence: 0.9, status: 'covered',
          quotes: [{ text: "that's all fine now", lang: 'en', gloss_en: "that's all fine now" }], findings: [] },
      ],
    },
    {
      id: 'adverse', label: 'Scars and treatment effects', severity: 'mild', confidence: 0.7,
      summary_en: 'Scar tightness in cold; picks at it when nervous.',
      constructs: [{ id: 'adverse.scarring', severity: 'mild', confidence: 0.7, status: 'covered',
        quotes: [{ text: 'He picks at it when he is nervous. Says it feels tight in the cold.', lang: 'en', gloss_en: 'He picks at it when he is nervous. Says it feels tight in the cold.' }], findings: [] }],
    },
  ],
  needs_clarification: [
    { construct_id: 'psych.distress', reason: 'Guardian describes him going quiet; no direct report of sadness or worry.' },
    { construct_id: 'psych.self_consciousness', reason: 'Blushing when asked to repeat suggests self-consciousness; not confirmed.' },
  ],
  not_covered: ['appearance.nose'],
  declined: [],
  patient_questions: [],
  change_from_prior: [],
  disclaimer: DISCLAIMER,
}

// A seeded intake session (SPEC §14 step 2) reachable via the demo link /p/demo-es.
const S5 = session('s-0002-postop6w', P2.id, 'post-op-6w', 'self', 'es', 'map-adult-1', 'intake', '2026-09-18')
S5.consent_given_at = null
S5.consent_variant = null
S5.started_at = null
S5.max_turns = 12
S5.input_tokens = 0
S5.output_tokens = 0
S5.cost_usd_estimate = null

const profileRow = (s: SessionRow, profile: Profile, patient_summary: string): SessionProfileRow => ({
  session_id: s.id,
  profile,
  patient_summary,
  patient_summary_confirmed_at: s.ended_at,
  patient_corrections: null,
  generated_at: s.ended_at ?? s.created_at,
})

export function buildDemoStore(): MockStore {
  return {
    participants: [P1, P2, P3],
    sessions: [S1, S2, S3, S4, S5],
    messages: [...S1m, ...S2m, ...S3m, ...S4m],
    evidence: [...S1ev, ...S2ev, ...S3ev, ...S4ev],
    findings: [...S1pf, ...S2pf, ...S3pf, ...S4pf],
    profiles: [
      profileRow(S1, S1profile, "Here's what I heard:\n• Your nose, especially the bump on your profile, has bothered you since you were a teenager and you avoid photos because of it.\n• You sometimes wonder whether new people are looking at it.\n• Breathing through the left side is blocked most of the time and you breathe through your mouth at night.\n• You hope for a straight profile and easier breathing.\n\nDid I get this right? You can correct anything."),
      profileRow(S2, S2profile, "Here's what I heard:\n• You're really happy with your new profile.\n• The tip is still a bit puffy and numb, but that's not bothering you much.\n• Breathing is much better and you sleep with your mouth closed now. You asked about a whistling sound; I've passed that on.\n• You feel comfortable in photos again.\n• You have no regrets about the decision.\n\nDid I get this right? You can correct anything."),
      profileRow(S3, S3profile, 'Esto es lo que entendí:\n• Le preocupan las mejillas caídas y sobre todo el cuello.\n• Evita las fotos, especialmente con sus nietos.\n• Con gente nueva se cubre el cuello con un pañuelo.\n• Siente que se ve unos diez años mayor y eso le pone triste.\n• Prefirió no hablar de la piel.\n• Espera verse descansada, no distinta.\n\n¿Lo he entendido bien? Puede corregir lo que quiera.'),
      profileRow(S4, S4profile, "Here's what I heard about Kai:\n• He has started asking why his lip looks different since changing school.\n• A classmate called him a name and he skipped football club for a week.\n• Family understand him well; new people ask him to repeat himself and he dislikes that.\n• Eating and drinking are fine.\n• His scar feels tight in the cold and he picks at it when nervous.\n\nDid I get this right? You can correct anything."),
    ],
    safety_flags: [],
    clinician_notes: [
      { id: 'note-1', session_id: S2.id, clinician_id: 'demo-clinician', note: 'Post-op review: check breathing symmetry and tip swelling trajectory.', focus_constructs: ['function.breathing', 'adverse.swelling_bruising'], created_at: '2026-09-01T09:50:00Z' },
      { id: 'note-2', session_id: S4.id, clinician_id: 'demo-clinician', note: 'Lip revision being considered; interested in school adjustment.', focus_constructs: ['social.school', 'appearance.lips'], created_at: '2026-08-25T09:50:00Z' },
    ],
    tokens: { 'demo-es': S5.id },
    draftMaps: [],
    scriptPos: {},
    lastAsks: {},
    convo: {},
  }
}
