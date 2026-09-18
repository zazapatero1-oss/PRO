import { describe, expect, it } from 'vitest'
import { aggregateDomainSeverity } from './severity'

describe('aggregateDomainSeverity (SPEC §8)', () => {
  it('uses the single construct severity when only one is rated', () => {
    expect(aggregateDomainSeverity(['severe'])).toEqual({ severity: 'severe', worst: null })
    expect(aggregateDomainSeverity(['mild', 'declined'])).toEqual({ severity: 'mild', worst: null })
  })
  it('uses the median with the worst noted for two or more', () => {
    expect(aggregateDomainSeverity(['none', 'severe'])).toEqual({ severity: 'severe', worst: null })
    expect(aggregateDomainSeverity(['none', 'mild', 'severe'])).toEqual({ severity: 'mild', worst: 'severe' })
    expect(aggregateDomainSeverity(['moderate', 'none', 'mild', 'severe'])).toEqual({ severity: 'moderate', worst: 'severe' })
  })
  it('reports declined when everything was declined, otherwise unclear', () => {
    expect(aggregateDomainSeverity(['declined'])).toEqual({ severity: 'declined', worst: null })
    expect(aggregateDomainSeverity(['unclear', 'declined'])).toEqual({ severity: 'unclear', worst: null })
    expect(aggregateDomainSeverity([])).toEqual({ severity: 'unclear', worst: null })
  })
})
