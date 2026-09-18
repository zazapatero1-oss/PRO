import type { DiagnosisCatalogEntry } from '../types'

// Static mirror of `diagnosis_catalog` (SPEC §5). Patients have no DB access, so the intake
// picklist uses this list; clinician pages prefer the DB and fall back to it.
export const DIAGNOSIS_CATALOG: DiagnosisCatalogEntry[] = [
  {
    id: 'dx-rhinoplasty',
    code: 'rhinoplasty',
    label_en: 'Rhinoplasty (nose surgery)',
    label_es: 'Rinoplastia (cirugía de nariz)',
    module: 'aesthetics',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.nose', 'appearance.overall', 'psych.self_consciousness', 'social.confidence', 'function.breathing', 'adverse.swelling_bruising', 'outcome.decision'],
  },
  {
    id: 'dx-cleft',
    code: 'cleft-lip-palate',
    label_en: 'Cleft lip and/or palate',
    label_es: 'Labio y/o paladar hendido',
    module: 'craniofacial',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.overall', 'appearance.lips', 'appearance.nose', 'psych.self_consciousness', 'social.school', 'function.speaking', 'function.eating', 'adverse.scarring'],
  },
  {
    id: 'dx-hn',
    code: 'hn-cancer',
    label_en: 'Head and neck cancer',
    label_es: 'Cáncer de cabeza y cuello',
    module: 'head-neck-cancer',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.overall', 'function.eating', 'function.speaking', 'function.expression', 'psych.self_consciousness', 'social.confidence', 'adverse.scarring', 'adverse.pain'],
  },
  {
    id: 'dx-skin',
    code: 'skin-cancer-face',
    label_en: 'Facial skin cancer',
    label_es: 'Cáncer de piel facial',
    module: 'skin-cancer',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.skin', 'appearance.overall', 'adverse.scarring', 'psych.distress', 'social.confidence', 'outcome.information'],
  },
  {
    id: 'dx-facelift',
    code: 'facelift',
    label_en: 'Facelift',
    label_es: 'Estiramiento facial (lifting)',
    module: 'aesthetics',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.overall', 'appearance.cheeks', 'appearance.jawline', 'appearance.skin', 'age.appraisal', 'psych.self_consciousness', 'social.confidence', 'adverse.swelling_bruising', 'adverse.numbness'],
  },
  {
    id: 'dx-injectables',
    code: 'injectables',
    label_en: 'Injectables (fillers / neuromodulators)',
    label_es: 'Inyectables (rellenos / neuromoduladores)',
    module: 'aesthetics',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.overall', 'appearance.lips', 'appearance.cheeks', 'age.appraisal', 'adverse.swelling_bruising', 'outcome.decision'],
  },
  {
    id: 'dx-cranio',
    code: 'craniosynostosis',
    label_en: 'Craniosynostosis',
    label_es: 'Craneosinostosis',
    module: 'craniofacial',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.overall', 'appearance.eyes', 'psych.self_consciousness', 'social.school', 'adverse.scarring'],
  },
  {
    id: 'dx-microtia',
    code: 'microtia',
    label_en: 'Microtia (ear difference)',
    label_es: 'Microtia (diferencia en la oreja)',
    module: 'craniofacial',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.overall', 'psych.self_consciousness', 'social.school', 'adverse.scarring'],
  },
  {
    id: 'dx-other',
    code: 'other',
    label_en: 'Other',
    label_es: 'Otro',
    module: 'aesthetics',
    default_map_slug_adult: 'face-q-adult',
    default_map_slug_pediatric: 'face-q-pediatric',
    focus_constructs: ['appearance.overall', 'psych.self_consciousness', 'social.confidence', 'psych.distress'],
  },
]

export function diagnosisLabel(entry: DiagnosisCatalogEntry | undefined, lang: string): string {
  if (!entry) return ''
  return lang === 'es' ? entry.label_es : entry.label_en
}
