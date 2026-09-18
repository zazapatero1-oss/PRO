import type { Vars } from '../i18n/translate'
import type { ChatState } from './chatReducer'

export interface ChatProgress {
  text: string
  /** Named only when the phrasebook has a patient-facing label for the focus construct. */
  focus: string | null
}

type T = (key: string, vars?: Vars) => string

/**
 * Phase-aware header progress (v1.1 §F). Returns null until the first `status` (or a hydrate)
 * says where the conversation is, so the header stays empty rather than guessing.
 */
export function chatProgress(t: T, state: ChatState): ChatProgress | null {
  if (!state.coverage) return null
  switch (state.sessionPhase) {
    case 'triage':
      return { text: t('patient.chat.progress.triage'), focus: null }
    case 'wrap-up':
      return { text: t('patient.chat.progress.wrapUp'), focus: null }
    default: {
      const p = state.focusProgress
      // A backend that sends no focus progress still gets a sensible header.
      const text = p
        ? t('patient.chat.progress.explore', { confirmed: p.confirmed, total: p.total })
        : t('patient.chat.coverage', { covered: state.coverage.covered, total: state.coverage.total_active })
      return { text, focus: focusLabel(t, state.currentFocus) }
    }
  }
}

/**
 * The patient app never loads the construct map (it is clinician-facing and English-only), so
 * focus labels come from the phrasebook keyed by construct id. Unknown ids stay unnamed.
 */
export function focusLabel(t: T, constructId: string | null): string | null {
  if (!constructId) return null
  const key = `patient.chat.focus.${constructId}`
  const label = t(key)
  return label === key ? null : label
}
