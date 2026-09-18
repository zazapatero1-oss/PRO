import type { Severity } from '../types'

const RANK: Record<Severity, number> = { none: 0, mild: 1, moderate: 2, severe: 3, unclear: -1, declined: -1 }

export function severityRank(s: Severity): number {
  return RANK[s]
}

export function isRated(s: Severity): boolean {
  return RANK[s] >= 0
}

/**
 * SPEC §8: domain severity = worst covered construct severity, unless there are ≥2 rated
 * constructs; then the median (upper median on ties) with the worst noted alongside.
 */
export function aggregateDomainSeverity(severities: Severity[]): { severity: Severity; worst: Severity | null } {
  const rated = severities.filter(isRated).sort((a, b) => RANK[a] - RANK[b])
  if (rated.length === 0) {
    // Nothing rated: the domain is "declined" only if the patient declined everything in it.
    return { severity: severities.length > 0 && severities.every((s) => s === 'declined') ? 'declined' : 'unclear', worst: null }
  }
  const worst = rated[rated.length - 1]
  if (rated.length === 1) return { severity: worst, worst: null }
  const median = rated[Math.floor(rated.length / 2)]
  return { severity: median, worst: worst === median ? null : worst }
}

/** CSS custom property name for a severity swatch. */
export function severityVar(s: Severity): string {
  return `var(--sev-${s})`
}
