import type { ConstructDef, ConstructMap, ConstructMapRow, FacetDef, InstrumentRow, TriageItem } from '../../types'

// Paraphrased construct abstractions built from publicly documented FACE-Q scale names.
// No instrument item text appears here (SPEC §2.1).

const c = (
  id: string,
  label: string,
  description: string,
  drill_down: string[],
  priority: ConstructDef['priority'] = 'standard',
  scale = label,
  extra: Partial<ConstructDef> = {},
): ConstructDef => ({
  id,
  label,
  description,
  severity_signals: {
    none: 'content; no concern or avoidance',
    mild: 'occasional concern, no avoidance',
    moderate: 'regular concern; some avoidance or interference',
    severe: 'persistent distress; avoidance affecting daily life',
  },
  drill_down,
  priority,
  source_refs: [{ instrument: 'face-q-aesthetics', scale }],
  ...extra,
})

const f = (...pairs: [string, string][]): FacetDef[] => pairs.map(([id, label]) => ({ id, label }))

// v1.1 §A: facets are the details that must be explored once a construct becomes a focus.
// Paraphrased prompts for the model, never item text. Seeded here for the constructs the
// mock conversation focuses on; the real maps (workstream A2) carry them for every construct.
const FACETS: Record<string, FacetDef[]> = {
  'appearance.overall': f(
    ['mirror_vs_photos', 'How the face looks in the mirror versus in photos'],
    ['features', 'Which features come to mind first'],
    ['age_fit', 'Whether the face fits how old they feel'],
    ['since_when', 'How long they have felt this way'],
    ['wanted_change', 'What they would want different'],
  ),
  'appearance.eyes': f(
    ['shape', 'Shape of the eyes'],
    ['symmetry', 'Whether the two eyes match'],
    ['position', 'Where they sit on the face / spacing'],
    ['lids', 'Eyelids and under-eye area'],
    ['photos_vs_mirror', 'How they look in photos versus the mirror'],
    ['wanted_change', 'What specifically they would want different'],
    ['since_when', 'How long this has bothered them'],
  ),
  'appearance.nose': f(
    ['shape', 'Shape of the nose from the front'],
    ['profile', 'The profile seen from the side'],
    ['symmetry', 'Whether the two sides match'],
    ['photos_vs_mirror', 'How it looks in photos versus the mirror'],
    ['others_comments', 'Whether other people have remarked on it'],
    ['wanted_change', 'What specifically they would want different'],
    ['since_when', 'How long this has bothered them'],
  ),
  'function.breathing': f(
    ['which_side', 'Whether one side is worse than the other'],
    ['daytime', 'How breathing is during an ordinary day'],
    ['sleep', 'Breathing at night and how they sleep'],
    ['exercise', 'Breathing during exercise or exertion'],
    ['since_when', 'When it started or changed'],
    ['what_helps', 'Anything that makes it easier'],
  ),
  'psych.self_consciousness': f(
    ['when_strongest', 'Situations where it is strongest'],
    ['frequency', 'How often it comes to mind'],
    ['avoidance', 'Whether it stops them doing things'],
    ['since_when', 'How long it has been like this'],
    ['what_helps', 'What makes it easier'],
  ),
}

// The stock opening screen (v1.1 §A). `intent` is what the model must find out, in its own words.
const ADULT_TRIAGE: TriageItem[] = [
  { id: 'overall', intent: 'How they feel overall about how their face looks right now', maps_to: ['appearance.overall'] },
  { id: 'features', intent: 'Which parts of their face are on their mind most (let them name features)', maps_to: ['appearance.*'] },
  {
    id: 'function',
    intent: 'Whether anything about the face makes everyday things harder: breathing, eating, speaking, expressions',
    maps_to: ['function.*'],
  },
  { id: 'impact', intent: 'How it affects how they feel about themselves and what they do socially', maps_to: ['psych.*', 'social.*'] },
  {
    id: 'recovery',
    intent: 'How recovery is going: pain, swelling, numbness, scarring',
    maps_to: ['adverse.*', 'recovery.*'],
    timepoints: ['post-op-2w', 'post-op-6w', 'post-op-6m', 'post-op-12m', 'follow-up'],
  },
]

const PEDIATRIC_TRIAGE: TriageItem[] = [
  { id: 'overall', intent: 'How the child feels about their face at the moment', maps_to: ['appearance.overall'] },
  { id: 'features', intent: 'Which part of their face they think about most', maps_to: ['appearance.*'] },
  { id: 'function', intent: 'Whether talking or eating is harder because of their face', maps_to: ['function.*'] },
  { id: 'impact', intent: 'How it goes at school and with friends, including teasing', maps_to: ['psych.*', 'social.*'] },
  {
    id: 'recovery',
    intent: 'How healing is going: sore spots, scars, anything that feels tight',
    maps_to: ['adverse.*'],
    timepoints: ['post-op-2w', 'post-op-6w', 'post-op-6m', 'post-op-12m', 'follow-up'],
  },
]

export const ADULT_MAP: ConstructMap = {
  slug: 'face-q-adult',
  version: 1,
  population: 'adult',
  language: 'en',
  domains: [
    {
      id: 'appearance',
      label: 'Satisfaction with facial appearance',
      weight: 1,
      constructs: [
        c('appearance.overall', 'Overall satisfaction with how the face looks',
          'How the person feels about their facial appearance as a whole: in the mirror, in photos, and how it fits their age.',
          ['Which features bother them most', 'Situations where it is worse (photos, video calls, bright light)', 'How long they have felt this way', 'What they hope will change'],
          'core', 'Satisfaction with Facial Appearance Overall', { facets: FACETS['appearance.overall'] }),
        c('appearance.nose', 'Feelings about the nose',
          'How the person feels about the shape, size and profile of their nose and how it fits the rest of the face.',
          ['Front view vs profile', 'Whether it changed after surgery or injury', 'Comments from others'],
          'standard', 'Satisfaction with Nose', { facets: FACETS['appearance.nose'] }),
        c('appearance.eyes', 'Feelings about the eyes and eye area',
          'How the person feels about the look of their eyes, eyelids and the area around them, including looking tired.',
          ['Puffiness, hooding or asymmetry', 'Whether it affects looking rested'], 'optional', 'Satisfaction with Eyes',
          { facets: FACETS['appearance.eyes'] }),
        c('appearance.lips', 'Feelings about the lips',
          'How the person feels about the shape, fullness and symmetry of their lips.',
          ['Symmetry', 'Fullness expectations'], 'optional', 'Satisfaction with Lips'),
        c('appearance.cheeks', 'Feelings about the cheeks',
          'How the person feels about cheek fullness, contour and sagging.', ['Hollowness vs fullness', 'Change over time'], 'optional', 'Satisfaction with Cheeks'),
        c('appearance.jawline', 'Feelings about chin and jawline',
          'How the person feels about the definition of the chin, jawline and neck.', ['Profile concerns', 'Neck laxity'], 'optional', 'Satisfaction with Lower Face and Jawline'),
        c('appearance.skin', 'Feelings about facial skin',
          'How the person feels about the texture, tone, wrinkles and marks on their facial skin.', ['Specific areas of concern', 'Sun or scar related changes'], 'standard', 'Satisfaction with Skin'),
      ],
    },
    {
      id: 'psychological',
      label: 'Psychological function',
      weight: 1,
      constructs: [
        c('psych.self_consciousness', 'Self-consciousness about appearance',
          'How much the person thinks about or feels watched because of how their face looks.',
          ['When it is strongest', 'Whether it stops them doing things', 'Change over time'], 'core', 'Psychological Function',
          { facets: FACETS['psych.self_consciousness'] }),
        c('psych.distress', 'Appearance-related distress',
          'Low mood, worry or upset that the person links to their facial appearance.',
          ['Frequency and triggers', 'What helps', 'Whether they have talked to anyone'], 'core', 'Appearance-related Psychosocial Distress'),
      ],
    },
    {
      id: 'social',
      label: 'Social function',
      weight: 1,
      constructs: [
        c('social.confidence', 'Confidence in social situations',
          'How comfortable the person feels meeting people, being looked at, and taking part in social life.',
          ['Situations avoided', 'Photos and video calls', 'Impact on work or relationships'], 'core', 'Social Function'),
      ],
    },
    {
      id: 'function',
      label: 'Facial function',
      weight: 1,
      constructs: [
        c('function.breathing', 'Breathing through the nose',
          'Ease of breathing through the nose during the day, exercise and sleep.',
          ['Which side', 'Sleep or exercise impact', 'Change since surgery'], 'standard', 'Nasal Breathing',
          { facets: FACETS['function.breathing'] }),
        c('function.eating', 'Eating and drinking',
          'Ease of chewing, swallowing and keeping food or drink in the mouth.', ['Textures avoided', 'Social meals'], 'optional', 'Eating and Drinking'),
        c('function.speaking', 'Speaking clearly',
          'Whether the person feels understood when speaking, in person and on the phone.', ['Situations where it is hardest', 'Being asked to repeat'], 'optional', 'Speech'),
        c('function.expression', 'Facial expression and movement',
          'Ability to smile, frown and show feeling naturally with the face.', ['Symmetry of smile', 'Impact on being understood'], 'optional', 'Facial Expression'),
      ],
    },
    {
      id: 'adverse',
      label: 'Adverse effects',
      weight: 0.8,
      constructs: [
        c('adverse.swelling_bruising', 'Swelling and bruising',
          'Swelling or bruising after treatment and how much it bothers the person.', ['Trend over recent days', 'Whether it limits activities'], 'standard', 'Adverse Effects: Swelling and Bruising'),
        c('adverse.numbness', 'Numbness or altered sensation',
          'Numb, tingling or odd sensations in the face after treatment.', ['Location', 'Whether it is improving'], 'optional', 'Adverse Effects: Numbness'),
        c('adverse.scarring', 'Scars',
          'How noticeable and bothersome any scars feel to the person.', ['Visibility to others', 'Tightness or itch'], 'standard', 'Appraisal of Scars'),
        c('adverse.pain', 'Pain or discomfort',
          'Pain, tightness or discomfort in the face related to the condition or treatment.', ['Pattern through the day', 'What helps', 'Sleep impact'], 'standard', 'Adverse Effects: Pain'),
      ],
    },
    {
      id: 'recovery',
      label: 'Recovery and early life impact',
      weight: 0.8,
      constructs: [
        c('recovery.early_life', 'Getting back to normal life',
          'How recovery is affecting daily routines, work and going out, in the early weeks after treatment.',
          ['What they cannot do yet', 'Expected vs actual pace'], 'standard', 'Recovery Early Life Impact'),
      ],
    },
    {
      id: 'outcome',
      label: 'Satisfaction with outcome, decision and information',
      weight: 1,
      constructs: [
        c('outcome.decision', 'Feelings about the decision to have treatment',
          'Whether the person feels the treatment was the right choice for them.', ['Would they do it again', 'What they expected'], 'standard', 'Satisfaction with Decision'),
        c('outcome.information', 'Satisfaction with information received',
          'Whether the person felt well informed about what to expect before and after treatment.', ['Gaps they noticed', 'Surprises during recovery'], 'optional', 'Satisfaction with Information'),
      ],
    },
    {
      id: 'age',
      label: 'Age appraisal',
      weight: 0.6,
      constructs: [
        c('age.appraisal', 'How old the face looks to them',
          'Whether the person feels their face looks older, younger or about the same as their age.', ['Which features drive this', 'Whether it matters to them'], 'optional', 'Age Appraisal'),
      ],
    },
  ],
  triage: ADULT_TRIAGE,
  coverage_rules: {
    min_confidence_to_count: 0.6,
    drill_down_threshold: 'moderate',
    core_constructs_required: true,
    max_constructs_per_session: 18,
    focus_facet_threshold: 0.7,
  },
}

const ped = (
  id: string,
  label: string,
  description: string,
  drill: string[],
  priority: ConstructDef['priority'] = 'standard',
  extra: Partial<ConstructDef> = {},
) =>
  c(id, label, description, drill, priority, label, {
    source_refs: [{ instrument: 'face-q-craniofacial', scale: label }],
    age_variants: { pediatric: { description, drill_down: drill } },
    ...extra,
  })

export const PEDIATRIC_MAP: ConstructMap = {
  slug: 'face-q-pediatric',
  version: 1,
  population: 'pediatric',
  language: 'en',
  domains: [
    {
      id: 'appearance',
      label: 'How the child feels about their face',
      weight: 1,
      constructs: [
        ped('appearance.overall', 'Feelings about their face overall', 'How the child feels about their face at school, with friends and in photos.', ['Teasing or comments from others', 'Whether they avoid activities'], 'core'),
        ped('appearance.lips', 'Feelings about the lip', 'How the child feels about the look of their lip and the area under the nose.', ['Whether they notice it in photos', 'Comments from other children']),
        ped('appearance.nose', 'Feelings about the nose', 'How the child feels about the shape of their nose.', ['Front view vs side view'], 'standard', {
          facets: f(
            ['shape', 'The shape of the nose'],
            ['symmetry', 'Whether the two sides look the same'],
            ['photos', 'How it looks in photos'],
            ['comments', 'Whether other children have said anything'],
            ['wanted_change', 'What they would want different'],
          ),
        }),
        ped('appearance.eyes', 'Feelings about the eyes', 'How the child feels about their eyes and forehead area.', ['Symmetry concerns'], 'optional', {
          facets: f(
            ['shape', 'The shape of the eyes'],
            ['symmetry', 'Whether the two eyes match'],
            ['lids', 'The eyelids and the area around them'],
            ['photos', 'How they look in photos'],
            ['wanted_change', 'What they would want different'],
          ),
        }),
      ],
    },
    {
      id: 'psychological',
      label: 'How they feel inside',
      weight: 1,
      constructs: [
        ped('psych.self_consciousness', 'Thinking about how they look', 'How often the child thinks about or worries about their face.', ['When it is strongest', 'What helps'], 'core'),
        ped('psych.distress', 'Feeling sad or worried about their face', 'Sadness or worry the child links to how their face looks.', ['Who they talk to', 'Frequency'], 'core'),
      ],
    },
    {
      id: 'social',
      label: 'Friends and school',
      weight: 1,
      constructs: [
        ped('social.school', 'Joining in at school and with friends', 'Whether the child joins in, makes friends and feels comfortable with peers.', ['Teasing', 'Activities avoided', 'Support from teachers'], 'core'),
      ],
    },
    {
      id: 'function',
      label: 'Talking and eating',
      weight: 1,
      constructs: [
        ped('function.speaking', 'Being understood when talking', 'Whether other people understand the child when they speak.', ['At school vs at home', 'Being asked to repeat'], 'standard', {
          facets: f(
            ['at_school', 'Being understood at school'],
            ['at_home', 'Being understood at home'],
            ['strangers', 'Being understood by people they do not know'],
            ['repeating', 'How often they are asked to repeat themselves'],
            ['how_it_feels', 'How that feels for them'],
          ),
        }),
        ped('function.eating', 'Eating and drinking', 'Whether eating and drinking are easy, including food or drink coming out of the nose.', ['Foods avoided', 'Meals at school'], 'optional'),
      ],
    },
    {
      id: 'adverse',
      label: 'Scars and treatment effects',
      weight: 0.8,
      constructs: [
        ped('adverse.scarring', 'Feelings about scars', 'How noticeable or bothersome scars feel to the child.', ['Whether others notice', 'Itch or tightness']),
        ped('adverse.pain', 'Pain or discomfort', 'Pain or discomfort in the face.', ['Pattern', 'What helps'], 'optional'),
      ],
    },
  ],
  triage: PEDIATRIC_TRIAGE,
  coverage_rules: {
    min_confidence_to_count: 0.6,
    drill_down_threshold: 'moderate',
    core_constructs_required: true,
    max_constructs_per_session: 18,
    focus_facet_threshold: 0.7,
  },
}

export const CONSTRUCT_MAP_ROWS: ConstructMapRow[] = [
  {
    id: 'map-adult-1',
    slug: 'face-q-adult',
    version: 1,
    population: 'adult',
    source_instrument_ids: ['inst-aesthetics'],
    map: ADULT_MAP,
    status: 'approved',
    approved_by: 'demo-clinician',
    approved_at: '2026-08-01T09:00:00Z',
    created_at: '2026-08-01T08:00:00Z',
  },
  {
    id: 'map-ped-1',
    slug: 'face-q-pediatric',
    version: 1,
    population: 'pediatric',
    source_instrument_ids: ['inst-craniofacial'],
    map: PEDIATRIC_MAP,
    status: 'approved',
    approved_by: 'demo-clinician',
    approved_at: '2026-08-01T09:00:00Z',
    created_at: '2026-08-01T08:00:00Z',
  },
]

export const INSTRUMENT_ROWS: InstrumentRow[] = [
  {
    id: 'inst-aesthetics',
    slug: 'face-q-aesthetics',
    name: 'FACE-Q Aesthetics',
    version: '2.0',
    publisher: 'Q-Portfolio / Memorial Sloan Kettering',
    license_notes: 'Licensed instrument. Item text is never stored; only scale names and paraphrased constructs.',
    license_url: 'https://qportfolio.org/',
    item_text_stored: false,
    created_at: '2026-08-01T08:00:00Z',
  },
  {
    id: 'inst-craniofacial',
    slug: 'face-q-craniofacial',
    name: 'FACE-Q Craniofacial',
    version: '1.0',
    publisher: 'Q-Portfolio / Memorial Sloan Kettering',
    license_notes: 'Licensed instrument. Item text is never stored; only scale names and paraphrased constructs.',
    license_url: 'https://qportfolio.org/',
    item_text_stored: false,
    created_at: '2026-08-01T08:00:00Z',
  },
]

export function findConstruct(map: ConstructMap | null | undefined, id: string): { domain: string; construct: ConstructDef } | null {
  if (!map) return null
  for (const d of map.domains) for (const k of d.constructs) if (k.id === id) return { domain: d.id, construct: k }
  return null
}
