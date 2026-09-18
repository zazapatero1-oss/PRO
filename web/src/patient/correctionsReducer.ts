import type { PatientCorrection } from '../types'

export interface CorrectionsState {
  draft: string
  items: PatientCorrection[]
}

export type CorrectionsAction =
  | { type: 'draft'; value: string }
  | { type: 'add'; construct_id?: string | null }
  | { type: 'remove'; index: number }
  | { type: 'clear' }

export const initialCorrections: CorrectionsState = { draft: '', items: [] }

export function correctionsReducer(state: CorrectionsState, action: CorrectionsAction): CorrectionsState {
  switch (action.type) {
    case 'draft':
      return { ...state, draft: action.value }
    case 'add': {
      const text = state.draft.trim()
      if (!text) return state
      return { draft: '', items: [...state.items, { construct_id: action.construct_id ?? null, patient_text: text }] }
    }
    case 'remove':
      return { ...state, items: state.items.filter((_, i) => i !== action.index) }
    case 'clear':
      return initialCorrections
  }
}

/** Corrections to submit: added items plus any unsubmitted draft text. */
export function finalCorrections(state: CorrectionsState): PatientCorrection[] {
  const draft = state.draft.trim()
  return draft ? [...state.items, { construct_id: null, patient_text: draft }] : state.items
}
