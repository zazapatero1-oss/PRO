import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n'
import { diffConstructMaps } from '../lib/mapDiff'
import type { ConstructMap } from '../types'
import { IngestDiffView } from './InstrumentsPage'

const base: ConstructMap = {
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
        {
          id: 'appearance.eyes',
          label: 'Feelings about the eyes and eye area',
          description: 'How the person feels about their eyes.',
          severity_signals: {},
          drill_down: [],
          facets: [{ id: 'shape', label: 'Shape of the eyes' }],
          priority: 'standard',
        },
      ],
    },
  ],
  triage: [{ id: 'overall', intent: 'How they feel overall', maps_to: ['appearance.overall'] }],
  coverage_rules: { min_confidence_to_count: 0.6, drill_down_threshold: 'moderate', core_constructs_required: true, max_constructs_per_session: 18 },
}

const next: ConstructMap = {
  ...base,
  version: 2,
  domains: [
    {
      ...base.domains[0],
      constructs: [
        {
          ...base.domains[0].constructs[0],
          facets: [
            { id: 'shape', label: 'Shape of the eyes' },
            { id: 'symmetry', label: 'Whether the two eyes match' },
            { id: 'lids', label: 'Eyelids and under-eye area' },
          ],
        },
      ],
    },
    {
      id: 'proposed',
      label: 'Proposed constructs (review before approval)',
      weight: 1,
      constructs: [
        {
          id: 'proposed.sleep_quality',
          label: 'Sleep quality',
          description: 'What matters to understand about how the person sleeps.',
          severity_signals: {},
          drill_down: [],
          facets: [{ id: 'since_when', label: 'How long it has been like this' }],
          priority: 'standard',
        },
      ],
    },
  ],
  triage: [
    { id: 'overall', intent: 'How they feel overall', maps_to: ['appearance.overall'] },
    { id: 'triage.sleep_quality', intent: 'Whether sleep quality is on their mind right now', maps_to: ['proposed.sleep_quality'] },
  ],
}

describe('diffConstructMaps', () => {
  it('reports new facets per construct, new constructs and new triage intents', () => {
    const d = diffConstructMaps(base, next)
    expect(d.facets).toHaveLength(1)
    expect(d.facets[0].construct_id).toBe('appearance.eyes')
    expect(d.facets[0].facets.map((f) => f.id)).toEqual(['symmetry', 'lids'])
    expect(d.constructs.map((c) => c.id)).toEqual(['proposed.sleep_quality'])
    expect(d.triage.map((t) => t.id)).toEqual(['triage.sleep_quality'])
    expect(d.totals).toEqual({ facets_added: 2, constructs_added: 1, triage_added: 1 })
  })

  it('treats every construct as new when there is no approved map to merge into', () => {
    const d = diffConstructMaps(null, next)
    expect(d.facets).toHaveLength(0)
    expect(d.constructs).toHaveLength(2)
    expect(d.triage).toHaveLength(2)
  })
})

describe('IngestDiffView', () => {
  const renderView = () =>
    render(
      <I18nProvider initial="en">
        <IngestDiffView
          detail={diffConstructMaps(base, next)}
          diff={{ facets_added: 2, constructs_added: ['proposed.sleep_quality'], triage_added: 1 }}
          baseLabel="face-q-adult v1"
          baseVersion={1}
          version={2}
          slug="face-q-adult"
        />
      </I18nProvider>,
    )

  it('summarises the merge and lists the added facets under their construct', () => {
    renderView()
    expect(
      screen.getByText('Merged into face-q-adult v1 → draft v2. New facets: 2 · new constructs: 1 · new opening questions: 1.'),
    ).toBeInTheDocument()
    const group = screen.getByRole('heading', { name: 'New facets on existing constructs' }).parentElement as HTMLElement
    expect(within(group).getByText('Feelings about the eyes and eye area')).toBeInTheDocument()
    expect(within(group).getByText('Whether the two eyes match')).toBeInTheDocument()
    expect(within(group).getByText('Eyelids and under-eye area')).toBeInTheDocument()
    // Facets that were already there are not repeated as additions.
    expect(within(group).queryByText('Shape of the eyes')).toBeNull()
  })

  it('lists new constructs and new opening-screen questions as text, not JSON', () => {
    renderView()
    const constructs = screen.getByRole('heading', { name: 'New constructs' }).parentElement as HTMLElement
    expect(within(constructs).getByText('Sleep quality')).toBeInTheDocument()
    expect(within(constructs).getByText('What matters to understand about how the person sleeps.')).toBeInTheDocument()

    const triage = screen.getByRole('heading', { name: 'New opening-screen questions' }).parentElement as HTMLElement
    expect(within(triage).getByText(/Whether sleep quality is on their mind right now/)).toBeInTheDocument()
    expect(document.querySelector('.json')).toBeNull()
  })

  it('says so explicitly when a section added nothing', () => {
    render(
      <I18nProvider initial="en">
        <IngestDiffView
          detail={diffConstructMaps(next, next)}
          diff={{ facets_added: 0, constructs_added: [], triage_added: 0 }}
          baseLabel="face-q-adult v2"
          baseVersion={2}
          version={3}
          slug="face-q-adult"
        />
      </I18nProvider>,
    )
    expect(screen.getAllByText('Nothing added in this section.')).toHaveLength(3)
  })
})
