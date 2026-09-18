import { assert, assertEquals } from "@std/assert";
import { handleReopenSession } from "./handler.ts";
import { handleDeleteParticipant } from "../delete-participant/handler.ts";
import { handleIngestInstrument, validateConstructMap } from "../ingest-instrument/handler.ts";
import { FakeAnthropic, fakeAuth, fixtureMap, seedSession } from "../_shared/testing.ts";

const auth = fakeAuth({ jwt: "clin-1" });
const req = () =>
  new Request("http://x", { method: "POST", headers: { authorization: "Bearer jwt" } });

Deno.test("reopen-session: safety-halted → active, flags reviewed, audit", async () => {
  const s = await seedSession({ status: "safety-halted" });
  s.db.clinicians.push({ id: "clin-1", display_name: "Dr", created_at: "" });
  await s.db.insertSafetyFlag({
    session_id: s.session.id,
    message_id: null,
    trigger: "self_harm",
    detected_by: "keyword",
    action_taken: "halt",
    reviewed_by: null,
    reviewed_at: null,
  });
  const res = await handleReopenSession({ db: s.db, auth }, req(), { session_id: s.session.id });
  assertEquals(await res.json(), { status: "active" });
  assertEquals(s.db.sessions[0].status, "active");
  assertEquals(s.db.flags[0].reviewed_by, "clin-1");
  assert(s.db.flags[0].reviewed_at);
  assertEquals(s.db.messages[0].role, "system-event");
  assert(s.db.audit.some((a) => a.action === "session.reopen" && a.actor_id === "clin-1"));
  const again = await handleReopenSession({ db: s.db, auth }, req(), { session_id: s.session.id })
    .catch((e) => e);
  assertEquals(again.status, 409);
});

Deno.test("delete-participant: cascades and leaves one audit row with study_id only", async () => {
  const s = await seedSession({ status: "active" });
  s.db.clinicians.push({ id: "clin-1", display_name: "Dr", created_at: "" });
  await s.db.insertMessage({
    session_id: s.session.id,
    seq: 1,
    role: "patient",
    content: "hi",
    input_mode: "text",
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  const res = await handleDeleteParticipant({ db: s.db, auth }, req(), {
    participant_id: s.participant.id,
  });
  assertEquals(await res.json(), { deleted: true, study_id: "P-0001" });
  assertEquals(s.db.participants.length, 0);
  assertEquals(s.db.sessions.length, 0);
  assertEquals(s.db.messages.length, 0);
  const audit = s.db.audit.filter((a) => a.action === "participant.delete");
  assertEquals(audit.length, 1);
  assertEquals(audit[0].target_id, "P-0001");
  assertEquals(audit[0].metadata, { study_id: "P-0001" });
  assertEquals(JSON.stringify(audit[0]).includes(s.participant.id), false);
});

Deno.test("ingest-instrument: stores a draft map at version max+1, prompt forbids copying item text; approve flips status", async () => {
  const s = await seedSession();
  s.db.clinicians.push({ id: "clin-1", display_name: "Dr", created_at: "" });
  s.db.instruments.push({
    id: "inst-1",
    slug: "face-q-aesthetics",
    name: "FACE-Q",
    version: "1",
    publisher: "x",
    license_notes: "licensed",
    license_url: null,
    item_text_stored: false,
    created_at: "",
  });
  await s.db.insertConstructMap({
    slug: "face-q-aesthetics-adult",
    version: 4,
    population: "adult",
    source_instrument_ids: [],
    map: fixtureMap(),
    status: "retired",
    approved_by: null,
    approved_at: null,
  });
  const proposed = fixtureMap({ slug: "ignored", version: 99 });
  const anthropic = new FakeAnthropic([{ text: "```json\n" + JSON.stringify(proposed) + "\n```" }]);
  const deps = { db: s.db, auth, anthropic, model: "m" };
  const res = await handleIngestInstrument(deps, req(), {
    instrument_slug: "face-q-aesthetics",
    text: "some extracted instrument text",
    population: "adult",
  });
  assertEquals(res.status, 201);
  const row = (await res.json()) as {
    id: string;
    slug: string;
    version: number;
    status: string;
    source_instrument_ids: string[];
    map: { slug: string; version: number };
  };
  assertEquals([row.slug, row.version, row.status], ["face-q-aesthetics-adult", 5, "draft"]);
  assertEquals(row.map.slug, "face-q-aesthetics-adult");
  assertEquals(row.map.version, 5);
  assertEquals(row.source_instrument_ids, ["inst-1"]);
  const system = String(anthropic.calls[0].params.system);
  assert(system.includes("never copy, quote, lightly reword, or list item text"));

  const approve = await handleIngestInstrument(deps, req(), {
    action: "approve",
    construct_map_id: row.id,
  });
  assertEquals(await approve.json(), { status: "approved" });
  const stored = s.db.maps.find((m) => m.id === row.id)!;
  assertEquals(stored.status, "approved");
  assertEquals(stored.approved_by, "clin-1");
  assertEquals((await s.db.getLatestApprovedMap("face-q-aesthetics-adult"))?.version, 5);
});

Deno.test("validateConstructMap: rejects structural drift, fills defaults", () => {
  let threw = false;
  try {
    validateConstructMap({ domains: [] });
  } catch {
    threw = true;
  }
  assert(threw);
  const m = validateConstructMap({
    domains: [{
      id: "d",
      label: "D",
      constructs: [{
        id: "d.c",
        label: "C",
        description: "x",
        severity_signals: { none: "a", mild: "b", moderate: "c", severe: "d" },
      }],
    }],
  });
  assertEquals(m.domains[0].constructs[0].priority, "standard");
  assertEquals(m.coverage_rules.max_constructs_per_session, 18);
});
