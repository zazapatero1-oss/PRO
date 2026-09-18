import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CONSTRUCT_MAP_ROWS } from '../api/mock/constructMaps'
import { I18nProvider } from '../i18n'
import type { ConstructEvidenceRow, ProfileConstruct, SessionDetail } from '../types'
import { SessionReview } from './SessionReview'

const sessionDetail = vi.fn()
vi.mock('../api', () => ({ api: { sessionDetail: (id: string) => sessionDetail(id) as unknown } }))

const evidence = (
  construct_id: string,
  patient_quote: string,
  facets: string[],
  triage_item: string | null,
): ConstructEvidenceRow => ({
  id: `ev-${construct_id}-${triage_item ?? 'x'}`,
  session_id: 's1',
  construct_id,
  message_id: 'm1',
  patient_quote,
  quote_gloss_en: patient_quote,
  severity: 'moderate',
  confidence: 0.8,
  interference: [],
  facets,
  triage_item,
  note: null,
  superseded_by: null,
  created_at: '2026-09-01T10:00:00Z',
})

const construct = (c: Partial<ProfileConstruct> & { id: string }): ProfileConstruct => ({
  severity: 'moderate',
  confidence: 0.8,
  quotes: [],
  findings: [],
  status: 'covered',
  ...c,
})

function detail(): SessionDetail {
  return {
    session: {
      id: 's1', participant_id: 'p1', timepoint: 'baseline', respondent: 'self', language: 'en',
      construct_map_id: 'map-adult-1', prompt_version: 'v1.1.0', model_id: 'claude-sonnet-5', status: 'completed',
      max_turns: 60, target_minutes: 20, started_at: null, ended_at: null, consent_given_at: null,
      consent_variant: 'adult', input_tokens: 10, output_tokens: 5, cost_usd_estimate: 0.01, created_at: '2026-09-01T10:00:00Z',
    },
    participant: {
      id: 'p1', study_id: 'P-0001', display_name: 'Sam', preferred_language: 'en', age_band: '30-49',
      reading_comfort: 'comfortable', diagnosis_code: 'rhinoplasty', diagnosis_text: '', is_demo: true,
      deleted_at: null, created_at: '2026-09-01T09:00:00Z',
    },
    messages: [],
    evidence: [
      // Deliberately out of map order: the block sorts by the triage screen's own order.
      evidence('psych.self_consciousness', 'I think about it when I meet people', [], 'impact'),
      evidence('appearance.overall', 'Mostly the nose', ['features'], 'features'),
      evidence('appearance.overall', 'Tired-looking, I suppose', [], 'overall'),
      evidence('appearance.nose', 'not a triage answer', ['shape'], null),
    ],
    findings: [],
    profile: {
      session_id: 's1',
      profile: {
        generated_with: { model: 'claude-sonnet-5', prompt_version: 'v1.1.0', map: 'face-q-adult@1' },
        domains: [
          {
            id: 'appearance', label: 'Satisfaction with facial appearance', severity: 'moderate', confidence: 0.85,
            summary_en: 'Nose-focused.',
            constructs: [
              construct({
                id: 'appearance.nose', severity: 'severe', confidence: 0.9,
                facets_covered: ['shape', 'profile'], facets_missing: ['symmetry', 'wanted_change'], confirmed: true,
              }),
              construct({
                id: 'appearance.overall',
                facets_covered: ['features'], facets_missing: ['age_fit'], confirmed: false,
              }),
            ],
          },
        ],
        needs_clarification: [{ construct_id: 'psych.distress', reason: 'No direct statement about mood' }],
        not_covered: [],
        declined: [],
        patient_questions: [],
        change_from_prior: [],
        disclaimer: 'AI-assisted inferred profile. Not a validated FACE-Q score.',
      },
      patient_summary: 'Here is what I heard',
      patient_summary_confirmed_at: null,
      patient_corrections: null,
      generated_at: '2026-09-01T10:20:00Z',
    },
    safety_flags: [],
    clinician_notes: [],
    construct_map: CONSTRUCT_MAP_ROWS.find((m) => m.id === 'map-adult-1') ?? null,
    prior_session: null,
  }
}

/** The construct block for one construct inside "Constructs and quotes". */
function constructBlock(label: string): HTMLElement {
  const section = (screen.getByRole('heading', { name: 'Constructs and quotes' }).closest('section') as HTMLElement)
  const head = within(section)
    .getAllByText(label)
    .map((el) => el.closest('.construct'))
    .find((el): el is HTMLElement => el !== null)
  if (!head) throw new Error(`no construct block for ${label}`)
  return head
}

async function renderReview() {
  sessionDetail.mockResolvedValue(detail())
  render(
    <I18nProvider initial="en">
      <MemoryRouter initialEntries={['/clinician/session/s1']}>
        <Routes>
          <Route path="/clinician/session/:id" element={<SessionReview />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
  await waitFor(() => expect(screen.getByText('Constructs and quotes')).toBeInTheDocument())
}

describe('SessionReview facets and triage (v1.1 §F)', () => {
  it('shows covered and missing facet chips with their map labels', async () => {
    await renderReview()
    const groups = constructBlock('Feelings about the nose').querySelectorAll('.facets__group')
    expect(within(groups[0] as HTMLElement).getByText('Covered')).toBeInTheDocument()
    expect(within(groups[0] as HTMLElement).getByText('Shape of the nose from the front')).toBeInTheDocument()
    expect(within(groups[0] as HTMLElement).getByText('The profile seen from the side')).toBeInTheDocument()
    expect(within(groups[1] as HTMLElement).getByText('Still open')).toBeInTheDocument()
    expect(within(groups[1] as HTMLElement).getByText('Whether the two sides match')).toBeInTheDocument()
  })

  it('badges a construct the patient confirmed, and marks one that was not', async () => {
    await renderReview()
    expect(within(constructBlock('Feelings about the nose')).getByText(/confirmed with patient/)).toBeInTheDocument()
    expect(within(constructBlock('Overall satisfaction with how the face looks')).getByText('not confirmed')).toBeInTheDocument()
  })

  it('lists unconfirmed focus constructs under needs clarification, alongside the profile entries', async () => {
    await renderReview()
    const heading = screen.getByRole('heading', { name: 'Needs clarification' })
    const items = Array.from((heading.parentElement as HTMLElement).querySelectorAll('li')).map((li) => li.textContent)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatch(/No direct statement about mood/)
    expect(items[1]).toBe('Overall satisfaction with how the face looks — Explored but not confirmed back with the patient')
  })

  it('shows the opening-screen answers in a First impressions block, in triage order', async () => {
    await renderReview()
    const heading = screen.getByRole('heading', { name: 'First impressions' })
    const section = heading.closest('section') as HTMLElement
    const intents = Array.from(section.querySelectorAll('.triage__intent')).map((el) => el.textContent)
    expect(intents).toEqual([
      'How they feel overall about how their face looks right now',
      'Which parts of their face are on their mind most (let them name features)',
      'How it affects how they feel about themselves and what they do socially',
    ])
    expect(within(section).getByText(/Tired-looking, I suppose/)).toBeInTheDocument()
    // Evidence without a triage_item belongs to the explore phase, not the opening screen.
    expect(within(section).queryByText(/not a triage answer/)).toBeNull()
  })
})
