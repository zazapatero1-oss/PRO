import type { ConstructDef, ConstructMap, FacetDef, TriageItem } from '../types'

/** Construct definition by id, across every domain of the map. */
export function findConstructDef(map: ConstructMap | null | undefined, id: string): ConstructDef | null {
  if (!map) return null
  for (const d of map.domains) for (const c of d.constructs) if (c.id === id) return c
  return null
}

export function constructLabel(map: ConstructMap | null | undefined, id: string): string {
  return findConstructDef(map, id)?.label ?? id
}

export function facetsOf(map: ConstructMap | null | undefined, constructId: string): FacetDef[] {
  return findConstructDef(map, constructId)?.facets ?? []
}

/** Facet label for a construct; falls back to the raw id so unknown facets still show. */
export function facetLabel(map: ConstructMap | null | undefined, constructId: string, facetId: string): string {
  return facetsOf(map, constructId).find((f) => f.id === facetId)?.label ?? facetId
}

export function triageItem(map: ConstructMap | null | undefined, id: string): TriageItem | null {
  return map?.triage?.find((t) => t.id === id) ?? null
}

/** Triage item order in the map; unknown ids sort last, keeping their relative order. */
export function triageOrder(map: ConstructMap | null | undefined, id: string): number {
  const idx = map?.triage?.findIndex((t) => t.id === id) ?? -1
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}
