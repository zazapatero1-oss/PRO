// FakeAnthropic scripts one `create` per ingest: the merge proposal.

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  handleIngestInstrument,
  type MergeProposal,
  mergeProposal,
  sharesLongRun,
  validateMergeProposal,
} from "./handler.ts";
import { FakeAnthropic, fakeAuth, FakeDb, fixtureMap } from "../_shared/testing.ts";
import type { ConstructMapRow, IngestInstrumentResponse } from "../_shared/types.ts";

const SOURCE_TEXT =
  "Over the past week how bothered have you been by the appearance of your nose in photographs " +
  "taken by other people at social events?";

function req(body: unknown): { request: Request; body: unknown } {
  return {
    request: new Request("https://example.test/ingest-instrument", {
      method: "POST",
      headers: { authorization: "Bearer clinician-jwt" },
    }),
    body,
  };
}

async function seedDb(): Promise<{ db: FakeDb; base: ConstructMapRow }> {
  const db = new FakeDb();
  db.clinicians.push({ id: "c1", display_name: "Dr Who", created_at: "" });
  db.instruments.push({
    id: "i1",
    slug: "face-q-aesthetics",
    name: "FACE-Q Aesthetics",
    version: "2",
    publisher: "pub",
    license_notes: "licensed",
    license_url: null,
    item_text_stored: false,
    created_at: "",
  });
  const map = fixtureMap();
  const base = await db.insertConstructMap({
    slug: "face-q-adult",
    version: 3,
    population: "adult",
    source_instrument_ids: ["i0"],
    map: { ...map, slug: "face-q-adult", version: 3 },
    status: "approved",
    approved_by: "c1",
    approved_at: "2026-01-01T00:00:00Z",
  });
  return { db, base };
}

const deps = (db: FakeDb, anthropic: FakeAnthropic) => ({
  db,
  auth: fakeAuth({ "clinician-jwt": "c1" }),
  anthropic,
  model: "fake-model",
});

const proposal: MergeProposal = {
  facets: {
    "appearance.nose": [
      { id: "shape", label: "Shape of the nose" }, // already present → skipped
      { id: "profile", label: "How it looks from the side" },
    ],
    "not.a.construct": [{ id: "x", label: "Nope" }],
  },
  new_constructs: [{
    domain_id: "social",
    domain_label: "Social function",
    id: "social.avoidance",
    label: "Avoiding social situations",
    description: "Whether they hold back from being with other people because of their face.",
    severity_signals: { none: "never", mild: "sometimes", moderate: "often", severe: "always" },
    drill_down: ["Which situations"],
    facets: [{ id: "events", label: "Group events and parties" }],
    priority: "standard",
    source_refs: [{ instrument: "face-q-aesthetics", scale: "Social Function" }],
  }],
  triage: [{ id: "social", intent: "Whether they pull back socially", maps_to: ["social.*"] }],
};

Deno.test("sharesLongRun: flags an eight-word overlap, ignores short or unrelated text", () => {
  assert(
    sharesLongRun("how bothered have you been by the appearance of your nose", SOURCE_TEXT, 8),
  );
  assertFalse(sharesLongRun("How the nose looks to them", SOURCE_TEXT, 8));
  assertFalse(sharesLongRun("short label", SOURCE_TEXT, 8));
  // Punctuation and case do not hide a copy.
  assert(sharesLongRun(
    "HOW BOTHERED, have you been by the appearance of your nose!",
    SOURCE_TEXT,
    8,
  ));
});

Deno.test("mergeProposal: appends facets and constructs, skips duplicates and copied wording", () => {
  const base = { ...fixtureMap(), slug: "face-q-adult", version: 3 };
  const copied: MergeProposal = {
    facets: {
      "appearance.overall": [
        { id: "verbatim", label: "how bothered have you been by the appearance of your nose" },
        { id: "social_events", label: "How it feels at social events" },
      ],
    },
    new_constructs: [],
    triage: [],
  };
  const { map, diff } = mergeProposal(
    base,
    { ...proposal, facets: { ...proposal.facets, ...copied.facets } },
    SOURCE_TEXT,
  );

  const nose = map.domains.flatMap((d) => d.constructs).find((c) => c.id === "appearance.nose")!;
  assertEquals(nose.facets?.map((f) => f.id), ["shape", "breathing", "profile"]);
  const overall = map.domains.flatMap((d) => d.constructs).find((c) =>
    c.id === "appearance.overall"
  )!;
  // The verbatim facet was rejected; the paraphrased one was kept.
  assertEquals(overall.facets?.map((f) => f.id), [
    "mirror",
    "photos",
    "wanted_change",
    "social_events",
  ]);

  assertEquals(diff.constructs_added, ["social.avoidance"]);
  assertEquals(diff.facets_added, 2);
  assertEquals(diff.triage_added, 1);
  assertEquals(map.domains.find((d) => d.id === "social")?.label, "Social function");
  assertEquals(map.triage?.map((t) => t.id), [
    "overall",
    "features",
    "impact",
    "recovery",
    "social",
  ]);
  // The base map is untouched.
  assertEquals(base.domains.length, 3);
});

Deno.test("validateMergeProposal: rejects an empty proposal, defaults priority", () => {
  const v = validateMergeProposal({
    facets: {},
    new_constructs: [{
      id: "a.b",
      label: "L",
      description: "D",
      severity_signals: { none: "n", mild: "m", moderate: "mo", severe: "s" },
      priority: "nonsense",
    }],
    triage: [],
  });
  assertEquals(v.new_constructs[0].priority, "standard");
  assertEquals(v.new_constructs[0].domain_id, "a");
  let threw = false;
  try {
    validateMergeProposal({ facets: {}, new_constructs: [], triage: [] });
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("ingest-instrument: merges into the approved map as a draft at version max+1", async () => {
  const { db, base } = await seedDb();
  const anthropic = new FakeAnthropic([{ text: JSON.stringify(proposal) }]);
  const { request, body } = req({
    instrument_slug: "face-q-aesthetics",
    text: SOURCE_TEXT,
    population: "adult",
  });
  const res = await handleIngestInstrument(deps(db, anthropic), request, body);
  assertEquals(res.status, 201);
  const out = await res.json() as IngestInstrumentResponse;

  assertEquals(out.diff, {
    facets_added: 1,
    constructs_added: ["social.avoidance"],
    triage_added: 1,
  });
  assertEquals(out.construct_map.status, "draft");
  assertEquals(out.construct_map.slug, "face-q-adult");
  assertEquals(out.construct_map.version, 4);
  assertEquals(out.construct_map.source_instrument_ids, ["i0", "i1"]);
  assertEquals(base.status, "approved");
  assertEquals(db.maps.length, 2);

  // The pasted text is nowhere in the stored map or the audit trail.
  const stored = JSON.stringify(db.maps[1]) + JSON.stringify(db.audit);
  assertFalse(stored.includes("Over the past week"));
  assert(db.audit.some((a) => a.action === "construct_map.ingest_merge"));

  const prompt = String(anthropic.calls[0].params.system);
  assertStringIncludes(prompt, "Propose ADDITIONS ONLY");
});

Deno.test("ingest-instrument: 409 when the population has no approved map; approve flips a draft", async () => {
  const { db } = await seedDb();
  const anthropic = new FakeAnthropic([{ text: JSON.stringify(proposal) }]);
  const { request, body } = req({
    instrument_slug: "face-q-aesthetics",
    text: SOURCE_TEXT,
    population: "pediatric",
  });
  let status = 0;
  try {
    await handleIngestInstrument(deps(db, anthropic), request, body);
  } catch (err) {
    status = (err as { status?: number }).status ?? 0;
  }
  assertEquals(status, 409);

  const merged = await handleIngestInstrument(
    deps(db, new FakeAnthropic([{ text: JSON.stringify(proposal) }])),
    ...Object.values(
      req({ instrument_slug: "face-q-aesthetics", text: SOURCE_TEXT, population: "adult" }),
    ) as [Request, unknown],
  );
  const draft = (await merged.json() as IngestInstrumentResponse).construct_map;
  const approved = await handleIngestInstrument(
    deps(db, new FakeAnthropic([])),
    ...Object.values(req({ action: "approve", construct_map_id: draft.id })) as [Request, unknown],
  );
  assertEquals(await approved.json(), { status: "approved" });
  assertEquals(db.maps.find((m) => m.id === draft.id)?.status, "approved");
});
