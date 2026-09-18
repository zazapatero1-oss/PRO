// ingest-instrument (v1.1 §E): pasted instrument text is MERGED into the latest approved map
// for the population — new facets on existing constructs, constructs only where nothing covers
// the item, suggested triage intents — and stored as a draft for a clinician to approve.
// The pasted text is never stored, and anything that copies its wording is rejected.

import type {
  AnthropicClientLike,
  AuthClient,
  ConstructMap,
  ConstructMapRow,
  Db,
  Domain,
  Facet,
  IngestDiff,
  IngestInstrumentResponse,
  Population,
  TriageItem,
} from "../_shared/types.ts";
import { badRequest, conflict, jsonResponse, notFound } from "../_shared/errors.ts";
import { requireClinician } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";
import { completeJson } from "../_shared/anthropic.ts";
import { buildIngestMergePrompt } from "../_shared/prompt.ts";

export interface IngestInstrumentDeps {
  db: Db;
  auth: AuthClient;
  anthropic: AnthropicClientLike;
  model: string;
  origin?: string;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Licence guard
// ---------------------------------------------------------------------------

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/**
 * True when `a` and `b` share a run of `n` consecutive words. Used to throw away any proposed
 * label or description that reproduces instrument wording (SPEC §2: item text never leaves the
 * source). Short texts can never share a long run, so they pass trivially.
 */
export function sharesLongRun(a: string, b: string, n = 8): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length < n || wb.length < n) return false;
  const runs = new Set<string>();
  for (let i = 0; i + n <= wb.length; i++) runs.add(wb.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= wa.length; i++) {
    if (runs.has(wa.slice(i, i + n).join(" "))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Model output
// ---------------------------------------------------------------------------

export interface ProposedConstruct {
  domain_id: string;
  domain_label?: string;
  id: string;
  label: string;
  description: string;
  severity_signals: { none: string; mild: string; moderate: string; severe: string };
  drill_down: string[];
  facets: Facet[];
  priority: "core" | "standard" | "optional";
  source_refs?: { instrument: string; scale: string }[];
}

export interface MergeProposal {
  facets: Record<string, Facet[]>;
  new_constructs: ProposedConstruct[];
  triage: TriageItem[];
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function facetList(v: unknown): Facet[] {
  if (!Array.isArray(v)) return [];
  const out: Facet[] = [];
  for (const raw of v) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const id = str(o.id);
    const label = str(o.label);
    if (id && label) out.push({ id, label });
  }
  return out;
}

/** Structural check only; the merge decides what is actually accepted. */
export function validateMergeProposal(v: unknown): MergeProposal {
  const o = (v ?? {}) as Record<string, unknown>;
  const facets: Record<string, Facet[]> = {};
  const rawFacets = (o.facets ?? {}) as Record<string, unknown>;
  if (typeof rawFacets !== "object" || Array.isArray(rawFacets)) {
    throw new Error("facets must be an object keyed by construct id");
  }
  for (const [id, list] of Object.entries(rawFacets)) facets[id] = facetList(list);

  const constructs: ProposedConstruct[] = [];
  for (const raw of Array.isArray(o.new_constructs) ? o.new_constructs : []) {
    const c = (raw ?? {}) as Record<string, unknown>;
    const s = (c.severity_signals ?? {}) as Record<string, unknown>;
    const id = str(c.id);
    const label = str(c.label);
    if (!id || !label) continue;
    constructs.push({
      domain_id: str(c.domain_id) || id.split(".")[0],
      domain_label: str(c.domain_label) || undefined,
      id,
      label,
      description: str(c.description) || label,
      severity_signals: {
        none: str(s.none),
        mild: str(s.mild),
        moderate: str(s.moderate),
        severe: str(s.severe),
      },
      drill_down: Array.isArray(c.drill_down) ? c.drill_down.map(str).filter(Boolean) : [],
      facets: facetList(c.facets),
      priority: ["core", "standard", "optional"].includes(String(c.priority))
        ? c.priority as ProposedConstruct["priority"]
        : "standard",
      source_refs: Array.isArray(c.source_refs)
        ? (c.source_refs as Record<string, unknown>[])
          .map((r) => ({ instrument: str(r.instrument), scale: str(r.scale) }))
          .filter((r) => r.scale)
        : [],
    });
  }

  const triage: TriageItem[] = [];
  for (const raw of Array.isArray(o.triage) ? o.triage : []) {
    const t = (raw ?? {}) as Record<string, unknown>;
    const id = str(t.id);
    const intent = str(t.intent);
    if (!id || !intent) continue;
    triage.push({
      id,
      intent,
      maps_to: Array.isArray(t.maps_to) ? t.maps_to.map(str).filter(Boolean) : [],
    });
  }

  if (constructs.length === 0 && triage.length === 0 && Object.keys(facets).length === 0) {
    throw new Error("the proposal is empty");
  }
  return { facets, new_constructs: constructs, triage };
}

/**
 * Applies the proposal to a copy of the approved map. Additive only: existing facets, constructs
 * and triage items are never touched, and duplicate ids are skipped. Anything whose wording
 * overlaps the source text by `runLength` words is dropped.
 */
export function mergeProposal(
  base: ConstructMap,
  proposal: MergeProposal,
  sourceText: string,
  runLength = 8,
): { map: ConstructMap; diff: IngestDiff } {
  const map: ConstructMap = JSON.parse(JSON.stringify(base));
  const diff: IngestDiff = { facets_added: 0, constructs_added: [], triage_added: 0 };
  const copiesSource = (...parts: string[]) =>
    parts.some((p) => p && sharesLongRun(p, sourceText, runLength));

  const constructsById = new Map<string, { construct: Domain["constructs"][number] }>();
  for (const d of map.domains) {
    for (const c of d.constructs) constructsById.set(c.id, { construct: c });
  }

  for (const [constructId, facets] of Object.entries(proposal.facets)) {
    const target = constructsById.get(constructId);
    if (!target) continue;
    const existing = target.construct.facets ?? [];
    const ids = new Set(existing.map((f) => f.id));
    for (const f of facets) {
      if (ids.has(f.id) || copiesSource(f.label)) continue;
      ids.add(f.id);
      existing.push(f);
      diff.facets_added++;
    }
    target.construct.facets = existing;
  }

  for (const c of proposal.new_constructs) {
    if (constructsById.has(c.id)) continue;
    if (copiesSource(c.label, c.description)) continue;
    const facets = c.facets.filter((f) => !copiesSource(f.label));
    let domain = map.domains.find((d) => d.id === c.domain_id);
    if (!domain) {
      domain = { id: c.domain_id, label: c.domain_label ?? c.domain_id, weight: 1, constructs: [] };
      map.domains.push(domain);
    }
    const construct = {
      id: c.id,
      label: c.label,
      description: c.description,
      severity_signals: c.severity_signals,
      drill_down: c.drill_down,
      facets,
      priority: c.priority,
      source_refs: c.source_refs,
    };
    domain.constructs.push(construct);
    constructsById.set(c.id, { construct });
    diff.constructs_added.push(c.id);
  }

  const triage = [...(map.triage ?? [])];
  const triageIds = new Set(triage.map((t) => t.id));
  for (const t of proposal.triage) {
    if (triageIds.has(t.id) || copiesSource(t.intent)) continue;
    triageIds.add(t.id);
    triage.push(t);
    diff.triage_added++;
  }
  map.triage = triage;

  return { map, diff };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleIngestInstrument(
  deps: IngestInstrumentDeps,
  req: Request,
  raw: unknown,
): Promise<Response> {
  const origin = deps.origin ?? "*";
  const now = deps.now ?? (() => new Date());
  const clinician = await requireClinician(req, deps);
  const body = (raw ?? {}) as Record<string, unknown>;
  const { db } = deps;

  if (body.action === "approve") {
    const id = typeof body.construct_map_id === "string" ? body.construct_map_id : "";
    if (!id) throw badRequest("construct_map_id is required");
    const row = await db.getConstructMap(id);
    if (!row) throw notFound("Construct map not found");
    if (row.status !== "draft") {
      throw conflict("Only draft maps can be approved.", "invalid_status");
    }
    await db.updateConstructMap(id, {
      status: "approved",
      approved_by: clinician.clinicianId,
      approved_at: now().toISOString(),
    });
    await writeAudit(db, {
      actor_type: "clinician",
      actor_id: clinician.clinicianId,
      action: "construct_map.approve",
      target_type: "construct_map",
      target_id: id,
      metadata: { slug: row.slug, version: row.version },
    });
    return jsonResponse({ status: "approved" }, 200, origin);
  }

  const instrumentSlug = typeof body.instrument_slug === "string"
    ? body.instrument_slug.trim()
    : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const population: Population | null = body.population === "pediatric"
    ? "pediatric"
    : body.population === "adult"
    ? "adult"
    : null;
  if (!instrumentSlug) throw badRequest("instrument_slug is required");
  if (!text) throw badRequest("text is required");
  if (text.length > 200_000) throw badRequest("text is too long");
  if (!population) throw badRequest("population must be adult or pediatric");

  const base = await db.getLatestApprovedMapForPopulation(population);
  if (!base) {
    throw conflict(
      `No approved ${population} construct map to merge into.`,
      "no_approved_map",
    );
  }
  const instrument = await db.getInstrumentBySlug(instrumentSlug);

  const { system, user } = buildIngestMergePrompt({
    instrumentSlug,
    population,
    currentMap: base.map,
    text,
  });
  const res = await completeJson<MergeProposal>({
    client: deps.anthropic,
    model: deps.model,
    system,
    user,
    maxTokens: 16000,
    validate: validateMergeProposal,
  });

  const merged = mergeProposal(base.map, res.value, text);
  const version = (await db.getMaxMapVersion(base.slug)) + 1;
  const map: ConstructMap = {
    ...merged.map,
    slug: base.slug,
    version,
    population,
    language: merged.map.language || base.map.language || "en",
  };
  const row: ConstructMapRow = await db.insertConstructMap({
    slug: base.slug,
    version,
    population,
    source_instrument_ids: [
      ...new Set([...(base.source_instrument_ids ?? []), ...(instrument ? [instrument.id] : [])]),
    ],
    map,
    status: "draft",
    approved_by: null,
    approved_at: null,
  });
  await writeAudit(db, {
    actor_type: "clinician",
    actor_id: clinician.clinicianId,
    action: "construct_map.ingest_merge",
    target_type: "construct_map",
    target_id: row.id,
    metadata: {
      slug: base.slug,
      version,
      merged_from: base.id,
      instrument_slug: instrumentSlug,
      diff: merged.diff,
      tokens: res.usage,
    },
  });
  const response: IngestInstrumentResponse = { construct_map: row, diff: merged.diff };
  return jsonResponse(response, 201, origin);
}
