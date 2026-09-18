import type { ConstructDef, ConstructMap, ConstructMapRow, InstrumentRow } from '../../types'

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
          'core', 'Satisfaction with Facial Appearance Overall'),
        c('appearance.nose', 'Feelings about the nose',
          'How the person feels about the shape, size and profile of their nose and how it fits the rest of the face.',
          ['Front view vs profile', 'Whether it changed after surgery or injury', 'Comments from others'],
          'standard', 'Satisfaction with Nose'),
        c('appearance.eyes', 'Feelings about the eyes and eye area',
          'How the person feels about the look of their eyes, eyelids and the area around them, including looking tired.',
          ['Puffiness, hooding or asymmetry', 'Whether it affects looking rested'], 'optional', 'Satisfaction with Eyes'),
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
          ['When it is strongest', 'Whether it stops them doing things', 'Change over time'], 'core', 'Psychological Function'),
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
          ['Which side', 'Sleep or exercise impact', 'Change since surgery'], 'standard', 'Nasal Breathing'),
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
  coverage_rules: {
    min_confidence_to_count: 0.6,
    drill_down_threshold: 'moderate',
    core_constructs_required: true,
    max_constructs_per_session: 18,
  },
}

const ped = (id: string, label: string, description: string, drill: string[], priority: ConstructDef['priority'] = 'standard') =>
  c(id, label, description, drill, priority, label, {
    source_refs: [{ instrument: 'face-q-craniofacial', scale: label }],
    age_variants: { pediatric: { description, drill_down: drill } },
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
        ped('appearance.nose', 'Feelings about the nose', 'How the child feels about the shape of their nose.', ['Front view vs side view']),
        ped('appearance.eyes', 'Feelings about the eyes', 'How the child feels about their eyes and forehead area.', ['Symmetry concerns'], 'optional'),
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
        ped('function.speaking', 'Being understood when talking', 'Whether other people understand the child when they speak.', ['At school vs at home', 'Being asked to repeat']),
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
  coverage_rules: {
    min_confidence_to_count: 0.6,
    drill_down_threshold: 'moderate',
    core_constructs_required: true,
    max_constructs_per_session: 18,
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
