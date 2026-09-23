import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { SessionState } from '../types'
import { FacePage } from './FacePage'

vi.mock('../api', () => ({ api: { diagnosisCatalog: () => Promise.resolve([]) } }))

// diagnosis_text is nullable in the database; a null must not break the submit handler.
const session = (diagnosis_text: string | null): SessionState =>
  ({
    session_id: 's1',
    status: 'consented',
    language: 'en',
    participant: {
      display_name: 'Sam',
      preferred_language: 'en',
      age_band: '30-49',
      reading_comfort: 'comfortable',
      diagnosis_code: 'rhinoplasty',
      diagnosis_text,
    },
    respondent: 'self',
    timepoint: 'baseline',
    consent_variant_needed: 'adult',
    messages: [],
    coverage: { covered: 0, total_active: 0 },
    phase: 'triage',
    current_focus: null,
    focus_progress: { confirmed: 0, total: 0 },
    turns_used: 0,
    max_turns: 60,
  }) as SessionState

describe('FacePage', () => {
  it.each([null, '', 'nose injury'])('submits when diagnosis_text is %p', (dxText) => {
    const onSubmit = vi.fn()
    render(
      <I18nProvider initial="en">
        <FacePage session={session(dxText)} onSubmit={onSubmit} busy={false} />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /start the conversation/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      display_name: 'Sam',
      diagnosis_code: 'rhinoplasty',
      diagnosis_text: dxText ? 'nose injury' : '',
    })
  })
})
