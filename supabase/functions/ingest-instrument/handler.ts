// ingest-instrument (SPEC §11 stub): text → proposed construct map (draft) → approve.

import type {
  AnthropicClientLike,
  AuthClient,
  ConstructMap,
  Db,
  Population,
} from "../_shared/types.ts";
import { badRequest, conflict, jsonResponse, notFound } from "../_shared/errors.ts";
import { requireClinician } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";
import { completeJson } from "../_shared/anthropic.ts";
import { buildIngestPrompt } from "../_shared/prompt.ts";

export interface IngestInstrumentDeps {
  db: Db;
  auth: AuthClient;
  anthropic: AnthropicClientLike;
  model: string;
  origin?: string;
  now?: () => Date;
}

/** Structural check of the §6 format; throws (→ retry) when the model drifts. */
export function validateConstructMap(v: unknown): ConstructMap {
  const m = (v ?? {}) as Record<string, unknown>;
  if (!Array.isArray(m.domains) || m.domains.length === 0) {
    throw new Error("domains must be a non-empty array");
  }
  for (const d of m.domains as Record<string, unknown>[]) {
    if (typeof d.id !== "string" || typeof d.label !== "string") {
      throw new Error("domain needs id and label");
    }
    if (!Array.isArray(d.constructs)) throw new Error(`domain ${d.id} needs constructs`);
    for (const c of d.constructs as Record<string, unknown>[]) {
      if (
        typeof c.id !== "string" || typeof c.label !== "string" || typeof c.description !== "string"
      ) {
        throw new Error(`construct in ${d.id} needs id, label, description`);
      }
      const s = (c.severity_signals ?? {}) as Record<string, unknown>;
      for (const k of ["none", "mild", "moderate", "severe"]) {
        if (typeof s[k] !== "string") {
          throw new Error(`construct ${c.id} severity_signals.${k} missing`);
        }
      }
      if (!Array.isArray(c.drill_down)) c.drill_down = [];
      if (!["core", "standard", "optional"].includes(String(c.priority))) c.priority = "standard";
    }
    if (typeof d.weight !== "number") d.weight = 1.0;
  }
  const rules = (m.coverage_rules ?? {}) as Record<string, unknown>;
  m.coverage_rules = {
    min_confidence_to_count: typeof rules.min_confidence_to_count === "number"
      ? rules.min_confidence_to_count
      : 0.6,
    drill_down_threshold:
      ["mild", "moderate", "severe"].includes(String(rules.drill_down_threshold))
        ? rules.drill_down_threshold
        : "moderate",
    core_constructs_required: rules.core_constructs_required !== false,
    max_constructs_per_session: typeof rules.max_constructs_per_session === "number"
      ? rules.max_constructs_per_session
      : 18,
  };
  return m as unknown as ConstructMap;
}

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
  const population = body.population === "pediatric"
    ? "pediatric"
    : body.population === "adult"
    ? "adult"
    : null;
  if (!instrumentSlug) throw badRequest("instrument_slug is required");
  if (!text) throw badRequest("text is required");
  if (text.length > 200_000) throw badRequest("text is too long");
  if (!population) throw badRequest("population must be adult or pediatric");

  const instrument = await db.getInstrumentBySlug(instrumentSlug);
  const { system, user } = buildIngestPrompt({
    instrumentSlug,
    population: population as Population,
    text,
  });
  const res = await completeJson<ConstructMap>({
    client: deps.anthropic,
    model: deps.model,
    system,
    user,
    maxTokens: 16000,
    validate: validateConstructMap,
  });

  const slug = `${instrumentSlug}-${population}`;
  const version = (await db.getMaxMapVersion(slug)) + 1;
  const map: ConstructMap = {
    ...res.value,
    slug,
    version,
    population,
    language: res.value.language || "en",
  };
  const row = await db.insertConstructMap({
    slug,
    version,
    population,
    source_instrument_ids: instrument ? [instrument.id] : [],
    map,
    status: "draft",
    approved_by: null,
    approved_at: null,
  });
  await writeAudit(db, {
    actor_type: "clinician",
    actor_id: clinician.clinicianId,
    action: "construct_map.ingest",
    target_type: "construct_map",
    target_id: row.id,
    metadata: { slug, version, instrument_slug: instrumentSlug, tokens: res.usage },
  });
  return jsonResponse(row, 201, origin);
}
