import type { ChatEvent, FocusProgress, InputMode, SessionPhase, SessionState, Severity } from '../types'

export type ChatRole = 'assistant' | 'patient' | 'system' | 'safety'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  streaming?: boolean
}

export type ChatPhase = 'idle' | 'sending' | 'streaming' | 'retrying' | 'ended' | 'safety' | 'error'

export interface ChatState {
  messages: ChatMessage[]
  coverage: { covered: number; total_active: number } | null
  /** Conversation phase from the tracker (v1.1 §B); distinct from `phase`, the turn state. */
  sessionPhase: SessionPhase
  currentFocus: string | null
  focusProgress: FocusProgress | null
  turnsUsed: number
  maxTurns: number
  phase: ChatPhase
  error: string | null
  lastEvidence: { construct_id: string; severity: Severity; confidence: number } | null
  endedReason: string | null
  safetyMessage: string | null
  /** Last patient turn, kept so a failed turn can be resent. */
  pending: { text: string | null; inputMode: InputMode | null } | null
}

export type ChatAction =
  | { type: 'hydrate'; state: SessionState }
  | { type: 'turn_start'; text: string | null; inputMode: InputMode | null; resend?: boolean }
  | { type: 'event'; event: ChatEvent }
  | { type: 'stream_done' }
  | { type: 'retrying' }
  | { type: 'failed'; message: string }

export const initialChatState: ChatState = {
  messages: [],
  coverage: null,
  sessionPhase: 'triage',
  currentFocus: null,
  focusProgress: null,
  turnsUsed: 0,
  maxTurns: 40,
  phase: 'idle',
  error: null,
  lastEvidence: null,
  endedReason: null,
  safetyMessage: null,
  pending: null,
}

let counter = 0
const nextId = () => `m${Date.now().toString(36)}-${(counter += 1)}`

function dropPartialAssistant(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1]
  return last && last.role === 'assistant' && last.streaming ? messages.slice(0, -1) : messages
}

function finalize(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => (m.streaming ? { ...m, streaming: false } : m))
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'hydrate': {
      const s = action.state
      const messages: ChatMessage[] = s.messages
        .filter((m) => m.role !== 'system-event')
        .map((m) => ({ id: `s${m.seq}`, role: m.role === 'patient' ? 'patient' : 'assistant', content: m.content }))
      const phase: ChatPhase =
        s.status === 'safety-halted' ? 'safety' : s.status === 'wrapping-up' || s.status === 'summary-review' ? 'ended' : 'idle'
      return {
        ...initialChatState,
        messages,
        coverage: s.coverage,
        // A backend that has not shipped the v1.1 fields yet leaves the header on the
        // triage wording rather than crashing.
        sessionPhase: s.phase ?? 'triage',
        currentFocus: s.current_focus ?? null,
        focusProgress: s.focus_progress ?? null,
        turnsUsed: s.turns_used,
        maxTurns: s.max_turns,
        phase,
      }
    }
    case 'turn_start': {
      const messages =
        action.text === null || action.resend
          ? state.messages
          : [...state.messages, { id: nextId(), role: 'patient' as const, content: action.text }]
      return { ...state, messages, phase: 'sending', error: null, pending: { text: action.text, inputMode: action.inputMode } }
    }
    case 'event': {
      const ev = action.event
      switch (ev.event) {
        case 'token': {
          const last = state.messages[state.messages.length - 1]
          if (last && last.role === 'assistant' && last.streaming) {
            const messages = state.messages.slice(0, -1)
            messages.push({ ...last, content: last.content + ev.data.t })
            return { ...state, messages, phase: 'streaming' }
          }
          return {
            ...state,
            messages: [...state.messages, { id: nextId(), role: 'assistant', content: ev.data.t, streaming: true }],
            phase: 'streaming',
          }
        }
        case 'evidence':
          // Extraction runs after the reply (v1.1 §C), so this can land mid-stream, after the
          // last token, or after `ended`. It must never touch messages or the turn phase.
          return { ...state, lastEvidence: ev.data }
        case 'status':
          return {
            ...state,
            coverage: ev.data.coverage,
            sessionPhase: ev.data.phase ?? state.sessionPhase,
            currentFocus: ev.data.current_focus ?? null,
            focusProgress: ev.data.focus_progress ?? state.focusProgress,
            turnsUsed: ev.data.turns_used,
            maxTurns: ev.data.max_turns,
          }
        case 'safety':
          return {
            ...state,
            messages: [...finalize(state.messages), { id: nextId(), role: 'safety', content: ev.data.message }],
            phase: 'safety',
            safetyMessage: ev.data.message,
            pending: null,
          }
        case 'ended':
          return { ...state, messages: finalize(state.messages), phase: 'ended', endedReason: ev.data.reason, pending: null }
        case 'error':
          // Retryable errors are handled by the hook (it dispatches `retrying`); a non-retryable
          // one ends the turn here.
          if (ev.data.retryable) return state
          return { ...state, messages: dropPartialAssistant(state.messages), phase: 'error', error: ev.data.message }
      }
      return state
    }
    case 'stream_done':
      if (state.phase === 'ended' || state.phase === 'safety' || state.phase === 'error') return { ...state, messages: finalize(state.messages) }
      return { ...state, messages: finalize(state.messages), phase: 'idle', pending: null }
    case 'retrying':
      return { ...state, messages: dropPartialAssistant(state.messages), phase: 'retrying' }
    case 'failed':
      return { ...state, messages: dropPartialAssistant(state.messages), phase: 'error', error: action.message }
    default:
      return state
  }
}
