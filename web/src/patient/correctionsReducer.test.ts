import { describe, expect, it } from 'vitest'
import { correctionsReducer, finalCorrections, initialCorrections, type CorrectionsAction } from './correctionsReducer'

const run = (actions: CorrectionsAction[]) => actions.reduce(correctionsReducer, initialCorrections)

describe('correctionsReducer', () => {
  it('adds trimmed drafts as corrections and clears the draft', () => {
    const s = run([{ type: 'draft', value: '  It is my chin, not my nose  ' }, { type: 'add' }])
    expect(s.items).toEqual([{ construct_id: null, patient_text: 'It is my chin, not my nose' }])
    expect(s.draft).toBe('')
  })

  it('ignores empty drafts and supports multiple corrections with removal', () => {
    const s = run([
      { type: 'draft', value: '   ' },
      { type: 'add' },
      { type: 'draft', value: 'one' },
      { type: 'add', construct_id: 'appearance.nose' },
      { type: 'draft', value: 'two' },
      { type: 'add' },
      { type: 'remove', index: 0 },
    ])
    expect(s.items).toEqual([{ construct_id: null, patient_text: 'two' }])
  })

  it('finalCorrections includes an unsubmitted draft', () => {
    const s = run([{ type: 'draft', value: 'a' }, { type: 'add' }, { type: 'draft', value: 'still typing' }])
    expect(finalCorrections(s)).toEqual([
      { construct_id: null, patient_text: 'a' },
      { construct_id: null, patient_text: 'still typing' },
    ])
    expect(finalCorrections(initialCorrections)).toEqual([])
  })
})
