import { describe, expect, it } from 'vitest'
import type { SessionState } from '../types'
import { chatReducer, initialChatState, type ChatAction, type ChatState } from './chatReducer'

const run = (actions: ChatAction[], start: ChatState = initialChatState) => actions.reduce(chatReducer, start)

const sessionState: SessionState = {
  session_id: 's1',
  status: 'active',
  language: 'en',
  participant: { display_name: 'Sam', preferred_language: 'en', age_band: '30-49', reading_comfort: 'comfortable', diagnosis_code: 'rhinoplasty', diagnosis_text: '' },
  respondent: 'self',
  timepoint: 'baseline',
  consent_variant_needed: 'adult',
  messages: [
    { seq: 1, role: 'assistant', content: 'Hi Sam', created_at: '' },
    { seq: 2, role: 'patient', content: 'Hello', created_at: '' },
    { seq: 3, role: 'system-event', content: 'pause_requested', created_at: '' },
  ],
  coverage: { covered: 2, total_active: 9 },
  phase: 'triage',
  current_focus: null,
  focus_progress: { confirmed: 0, total: 3 },
  turns_used: 1,
  max_turns: 40,
}

describe('chatReducer', () => {
  it('hydrates from session-state, hiding system events', () => {
    const s = chatReducer(initialChatState, { type: 'hydrate', state: sessionState })
    expect(s.messages.map((m) => m.role)).toEqual(['assistant', 'patient'])
    expect(s.coverage).toEqual({ covered: 2, total_active: 9 })
    expect(s.sessionPhase).toBe('triage')
    expect(s.focusProgress).toEqual({ confirmed: 0, total: 3 })
    expect(s.phase).toBe('idle')
    expect(chatReducer(initialChatState, { type: 'hydrate', state: { ...sessionState, status: 'safety-halted' } }).phase).toBe('safety')
  })

  it('appends the patient message on turn_start and streams tokens into one assistant bubble', () => {
    const s = run([
      { type: 'turn_start', text: 'My nose', inputMode: 'voice' },
      { type: 'event', event: { event: 'token', data: { t: 'Thanks ' } } },
      { type: 'event', event: { event: 'token', data: { t: 'for sharing.' } } },
    ])
    expect(s.messages).toHaveLength(2)
    expect(s.messages[0]).toMatchObject({ role: 'patient', content: 'My nose' })
    expect(s.messages[1]).toMatchObject({ role: 'assistant', content: 'Thanks for sharing.', streaming: true })
    expect(s.phase).toBe('streaming')
    const done = chatReducer(s, { type: 'stream_done' })
    expect(done.messages[1].streaming).toBe(false)
    expect(done.phase).toBe('idle')
    expect(done.pending).toBeNull()
  })

  it('does not duplicate the patient message on resend, and skips it for the opening turn', () => {
    const s = run([
      { type: 'turn_start', text: 'Hello', inputMode: 'text' },
      { type: 'failed', message: 'boom' },
      { type: 'turn_start', text: 'Hello', inputMode: 'text', resend: true },
    ])
    expect(s.messages.filter((m) => m.role === 'patient')).toHaveLength(1)
    expect(run([{ type: 'turn_start', text: null, inputMode: null }]).messages).toHaveLength(0)
  })

  it('records evidence hints and the v1.1 status fields', () => {
    const s = run([
      { type: 'event', event: { event: 'evidence', data: { construct_id: 'appearance.nose', severity: 'severe', confidence: 0.9 } } },
      {
        type: 'event',
        event: {
          event: 'status',
          data: {
            coverage: { covered: 3, total_active: 9 },
            phase: 'explore',
            current_focus: 'appearance.nose',
            focus_progress: { confirmed: 1, total: 3 },
            turns_used: 4,
            max_turns: 40,
          },
        },
      },
    ])
    expect(s.lastEvidence?.construct_id).toBe('appearance.nose')
    expect(s.coverage).toEqual({ covered: 3, total_active: 9 })
    expect(s.sessionPhase).toBe('explore')
    expect(s.currentFocus).toBe('appearance.nose')
    expect(s.focusProgress).toEqual({ confirmed: 1, total: 3 })
    expect(s.turnsUsed).toBe(4)
  })

  it('accepts evidence that arrives after the reply text without disturbing the bubble', () => {
    // v1.1 §C: extraction runs after the reply, so evidence lands between the last token and
    // the status event — and sometimes after `ended`.
    const s = run([
      { type: 'turn_start', text: 'My nose', inputMode: 'text' },
      { type: 'event', event: { event: 'token', data: { t: 'Thanks ' } } },
      { type: 'event', event: { event: 'token', data: { t: 'for that.' } } },
      { type: 'event', event: { event: 'evidence', data: { construct_id: 'appearance.nose', severity: 'moderate', confidence: 0.8 } } },
      { type: 'event', event: { event: 'evidence', data: { construct_id: 'psych.distress', severity: 'mild', confidence: 0.6 } } },
      {
        type: 'event',
        event: {
          event: 'status',
          data: {
            coverage: { covered: 4, total_active: 9 },
            phase: 'explore',
            current_focus: 'appearance.nose',
            focus_progress: { confirmed: 0, total: 3 },
            turns_used: 5,
            max_turns: 40,
          },
        },
      },
    ])
    expect(s.messages).toHaveLength(2)
    expect(s.messages[1]).toMatchObject({ role: 'assistant', content: 'Thanks for that.', streaming: true })
    expect(s.phase).toBe('streaming')
    expect(s.lastEvidence?.construct_id).toBe('psych.distress')

    const done = chatReducer(s, { type: 'stream_done' })
    expect(done.messages[1].streaming).toBe(false)

    // …and after `ended`, evidence still only updates the hint.
    const late = run(
      [
        { type: 'event', event: { event: 'ended', data: { reason: 'coverage_complete' } } },
        { type: 'event', event: { event: 'evidence', data: { construct_id: 'function.breathing', severity: 'mild', confidence: 0.7 } } },
      ],
      s,
    )
    expect(late.phase).toBe('ended')
    expect(late.messages).toHaveLength(2)
    expect(late.messages[1].content).toBe('Thanks for that.')
    expect(late.lastEvidence?.construct_id).toBe('function.breathing')
  })

  it('safety event renders the fixed message and disables input', () => {
    const s = run([
      { type: 'turn_start', text: 'x', inputMode: 'text' },
      { type: 'event', event: { event: 'safety', data: { message: 'Fixed safety text' } } },
      { type: 'stream_done' },
    ])
    expect(s.phase).toBe('safety')
    expect(s.messages[s.messages.length - 1]).toMatchObject({ role: 'safety', content: 'Fixed safety text' })
    expect(s.safetyMessage).toBe('Fixed safety text')
  })

  it('ended event finalises the stream and keeps phase ended after stream_done', () => {
    const s = run([
      { type: 'turn_start', text: 'bye', inputMode: 'text' },
      { type: 'event', event: { event: 'token', data: { t: 'Thanks.' } } },
      { type: 'event', event: { event: 'ended', data: { reason: 'coverage_complete' } } },
      { type: 'stream_done' },
    ])
    expect(s.phase).toBe('ended')
    expect(s.endedReason).toBe('coverage_complete')
    expect(s.messages[1].streaming).toBe(false)
  })

  it('non-retryable error drops the partial bubble and keeps the pending turn for resend', () => {
    const s = run([
      { type: 'turn_start', text: 'x', inputMode: 'text' },
      { type: 'event', event: { event: 'token', data: { t: 'partial' } } },
      { type: 'event', event: { event: 'error', data: { retryable: false, message: 'nope' } } },
    ])
    expect(s.phase).toBe('error')
    expect(s.error).toBe('nope')
    expect(s.messages).toHaveLength(1)
    expect(s.pending).toEqual({ text: 'x', inputMode: 'text' })
  })

  it('retrying drops the partial bubble and a retryable error event is left to the hook', () => {
    const s = run([
      { type: 'turn_start', text: 'x', inputMode: 'text' },
      { type: 'event', event: { event: 'token', data: { t: 'partial' } } },
      { type: 'event', event: { event: 'error', data: { retryable: true, message: 'transient' } } },
    ])
    expect(s.phase).toBe('streaming')
    const r = chatReducer(s, { type: 'retrying' })
    expect(r.phase).toBe('retrying')
    expect(r.messages).toHaveLength(1)
  })
})
