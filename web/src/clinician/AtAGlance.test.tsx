import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n'
import type { ConstructMap, ProfileConstruct, ScreenItem } from '../types'
import { AtAGlance } from './AtAGlance'

const item = (id: string, construct_id: string, domain: ScreenItem['domain'], sort_order: number): ScreenItem => ({
  id, population: 'adult', construct_id, domain, text_en: `Q ${id}?`, text_es: `P ${id}?`,
  low_en: 'Bad', high_en: 'Good', low_es: 'Mal', high_es: 'Bien', sort_order, active: true,
})
const items = [
  item('nose', 'appearance.nose', 'facial', 1),
  item('eyes', 'appearance.eyes', 'facial', 2),
  item('breathing', 'function.breathing', 'function', 3),
  item('mood', 'psych.mood', 'social', 4),
]
const map = {
  domains: [
    { id: 'appearance', label: 'Appearance', constructs: [
      { id: 'appearance.nose', label: 'Nose', facets: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
      { id: 'appearance.eyes', label: 'Eyes' },
    ] },
    { id: 'function', label: 'Function', constructs: [{ id: 'function.breathing', label: 'Breathing' }] },
    { id: 'psychological', label: 'Psych', constructs: [{ id: 'psych.mood', label: 'Mood' }] },
  ],
} as unknown as ConstructMap
const constructs = [
  {
    id: 'appearance.nose', severity: 'severe', confidence: 0.9, status: 'covered', findings: [], confirmed: true,
    facets_covered: ['a'], facets_missing: ['b'],
    quotes: [{ text: '2/10 — Q nose?', lang: 'en', gloss_en: '2/10 — Q nose?' }, { text: 'the bump ruins every photo', lang: 'en', gloss_en: 'the bump ruins every photo' }],
  },
] as unknown as ProfileConstruct[]

const renderIt = (prior: Parameters<typeof AtAGlance>[0]['prior'] = null) =>
  render(
    <I18nProvider initial="en">
      <AtAGlance items={items} scores={{ nose: 2, eyes: 9, breathing: 5, mood: 8 }} prior={prior} constructs={constructs} focus={[]} map={map} />
    </I18nProvider>,
  )

describe('AtAGlance', () => {
  it('lists low ratings first, lowest on top, and tucks the high ones below', () => {
    renderIt()
    const low = screen.getAllByRole('listitem').filter((li) => li.className === 'glance__row')
    expect(low.map((li) => within(li).getByText(/Nose|Breathing/).textContent)).toEqual(['Nose', 'Breathing'])
    expect(screen.getByText('Rated 7 or higher')).toBeTruthy()
    expect(screen.getByText('Eyes')).toBeTruthy()
    expect(screen.getByText(/2 of 4 areas rated 6 or lower · 1 discussed in the conversation · 1 confirmed/)).toBeTruthy()
  })

  it("shows what the patient said, never the rating itself as a quote, and flags what wasn't discussed", () => {
    renderIt()
    expect(screen.getByText(/the bump ruins every photo/)).toBeTruthy()
    expect(screen.queryByText(/2\/10 — Q nose/)).toBeNull()
    expect(screen.getByText('1 of 2 details covered')).toBeTruthy()
    expect(screen.getByText('Not discussed in the conversation.')).toBeTruthy() // breathing
  })

  it('shows change against the previous visit per item and per domain', () => {
    renderIt({ timepoint: 'baseline', scores: { nose: 5, eyes: 9, breathing: 3, mood: 8 } })
    expect(screen.getByText(/Change is shown against Baseline/)).toBeTruthy()
    expect(screen.getByText('▼ −3')).toBeTruthy() // nose 5 → 2
    expect(screen.getByText('▲ +2')).toBeTruthy() // breathing 3 → 5
    expect(screen.getByText('▼ −1.5')).toBeTruthy() // facial mean 7.0 → 5.5
  })
})
