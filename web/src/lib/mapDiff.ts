import type { ConstructMap, FacetDef, TriageItem } from '../types'
import { findConstructDef } from './constructMap'

/**
 * Structural diff of a proposed draft map against the approved map it was merged into.
 *
 * The `ingest-instrument` contract (v1.1 §E) returns only counts, which is enough for a
 * headline but not for a review: the clinician has to see *which* facets landed on *which*
 * construct before approving. Those details are derivable from the two maps, so they are
 * computed here rather than added to the contract.
 */
export interface MapDiffDetail {
  facets: { construct_id: string; label: string; facets: FacetDef[] }[]
  constructs: { id: string; label: string; description: string; facets: FacetDef[] }[]
  triage: TriageItem[]
  totals: { facets_added: number; constructs_added: number; triage_added: number }
}

export function diffConstructMaps(base: ConstructMap | null, next: ConstructMap): MapDiffDetail {
  const facets: MapDiffDetail['facets'] = []
  const constructs: MapDiffDetail['constructs'] = []

  for (const d of next.domains) {
    for (const c of d.constructs) {
      const before = findConstructDef(base, c.id)
      if (!before) {
        constructs.push({ id: c.id, label: c.label, description: c.description, facets: c.facets ?? [] })
        continue
      }
      const had = new Set((before.facets ?? []).map((f) => f.id))
      const added = (c.facets ?? []).filter((f) => !had.has(f.id))
      if (added.length > 0) facets.push({ construct_id: c.id, label: c.label, facets: added })
    }
  }

  const hadTriage = new Set((base?.triage ?? []).map((t) => t.id))
  const triage = (next.triage ?? []).filter((t) => !hadTriage.has(t.id))

  return {
    facets,
    constructs,
    triage,
    totals: {
      facets_added: facets.reduce((n, f) => n + f.facets.length, 0),
      constructs_added: constructs.length,
      triage_added: triage.length,
    },
  }
}
