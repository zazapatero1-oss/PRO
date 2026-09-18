import { assert, assertEquals, assertMatch } from "@std/assert";
import { handleStartSession } from "./handler.ts";
import { handleSessionState } from "../session-state/handler.ts";
import { fakeAuth, FakeDb, fakeId, fixtureMap } from "../_shared/testing.ts";
import { hashToken } from "../_shared/db.ts";
import type { SessionStateResponse, StartSessionResponse } from "../_shared/types.ts";

function req(jwt: string | null, url = "http://x/start-session"): Request {
  return new Request(url, {
    method: "POST",
    headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
  });
}

async function setup() {
  const db = new FakeDb();
  db.clinicians.push({ id: "clin-1", display_name: "Dr A", created_at: "" });
  db.diagnoses.push({
    id: fakeId("dx"),
    code: "cleft-lip-palate",
    label_en: "Cleft lip and palate",
    label_es: "Labio y paladar hendido",
    module: "craniofacial",
    default_map_slug_adult: "face-q-adult",
    default_map_slug_pediatric: "face-q-pediatric",
    focus_constructs: ["appearance.overall", "psych.self_consciousness"],
    created_at: "",
  });
  for (
    const [slug, population] of [["face-q-adult", "adult"], [
      "face-q-pediatric",
      "pediatric",
    ]] as const
  ) {
    await db.insertConstructMap({
      slug,
      version: 1,
      population,
      source_instrument_ids: [],
      map: fixtureMap({ slug, population }),
      status: "approved",
      approved_by: null,
      approved_at: null,
    });
    await db.insertConstructMap({
      slug,
      version: 2,
      population,
      source_instrument_ids: [],
      map: fixtureMap({ slug, population, version: 2 }),
      status: "approved",
      approved_by: null,
      approved_at: null,
    });
    await db.insertConstructMap({
      slug,
      version: 3,
      population,
      source_instrument_ids: [],
      map: fixtureMap({ slug, population, version: 3 }),
      status: "draft",
      approved_by: null,
      approved_at: null,
    });
  }
  const auth = fakeAuth({ "good-jwt": "clin-1", "stranger-jwt": "user-9" });
  const deps = { db, auth, model: "claude-sonnet-5", promptVersion: "v1" };
  return { db, deps };
}

const body = {
  participant: {
    display_name: "Lu",
    preferred_language: "es",
    age_band: "8-12",
    reading_comfort: "short-messages",
    diagnosis_code: "cleft-lip-palate",
    diagnosis_text: "cleft",
  },
  timepoint: "baseline",
  respondent: "guardian",
  clinician_note: { note: "School photos", focus_constructs: ["psych.self_consciousness"] },
};

Deno.test("start-session: creates participant + intake session on the latest approved pediatric map", async () => {
  const { db, deps } = await setup();
  const res = await handleStartSession(deps, req("good-jwt"), body);
  assertEquals(res.status, 201);
  const out = (await res.json()) as StartSessionResponse;
  assertMatch(out.study_id, /^P-\d{4}$/);
  assertEquals(out.patient_link_path, `/p/${out.resume_token}`);
  assert(out.resume_token.length >= 43);
  const session = db.sessions[0];
  assertEquals(session.id, out.session_id);
  assertEquals(session.status, "intake");
  assertEquals(session.language, "es");
  assertEquals(session.prompt_version, "v1");
  assertEquals(session.model_id, "claude-sonnet-5");
  assertEquals(session.resume_token_hash, await hashToken(out.resume_token));
  const mapRow = db.maps.find((m) => m.id === session.construct_map_id)!;
  assertEquals([mapRow.slug, mapRow.version], ["face-q-pediatric", 2]);
  assertEquals(db.notes[0].focus_constructs, ["psych.self_consciousness"]);
  assertEquals(db.audit[0].action, "session.create");
});

Deno.test("start-session: reuses an existing study_id; adult band picks the adult map", async () => {
  const { db, deps } = await setup();
  const first =
    (await (await handleStartSession(deps, req("good-jwt"), body)).json()) as StartSessionResponse;
  const second = (await (await handleStartSession(deps, req("good-jwt"), {
    ...body,
    participant: { ...body.participant, study_id: first.study_id, age_band: "30-49" },
    timepoint: "post-op-6w",
    respondent: "self",
    clinician_note: null,
  })).json()) as StartSessionResponse;
  assertEquals(second.participant_id, first.participant_id);
  assertEquals(db.participants.length, 1);
  assertEquals(db.participants[0].age_band, "30-49");
  const mapRow = db.maps.find((m) => m.id === db.sessions[1].construct_map_id)!;
  assertEquals(mapRow.slug, "face-q-adult");
});

Deno.test("start-session: auth and validation failures", async () => {
  const { deps } = await setup();
  assertEquals((await handleStartSession(deps, req(null), body).catch((e) => e)).status, 401);
  assertEquals(
    (await handleStartSession(deps, req("stranger-jwt"), body).catch((e) => e)).status,
    403,
  );
  assertEquals(
    (await handleStartSession(deps, req("good-jwt"), { ...body, timepoint: "nope" }).catch((e) =>
      e
    )).status,
    400,
  );
  const err = await handleStartSession(deps, req("good-jwt"), {
    ...body,
    participant: { ...body.participant, diagnosis_code: "zzz" },
  }).catch((e) => e);
  assertEquals(err.code, "unknown_diagnosis");
});

Deno.test("session-state: read, consent, update_intake; consent_variant_needed rule", async () => {
  const { db, deps } = await setup();
  const start =
    (await (await handleStartSession(deps, req("good-jwt"), body)).json()) as StartSessionResponse;
  const state = (await (await handleSessionState({ db }, { resume_token: start.resume_token }))
    .json()) as SessionStateResponse;
  assertEquals(state.status, "intake");
  assertEquals(state.consent_variant_needed, "guardian");
  assertEquals(state.participant.display_name, "Lu");
  assertEquals(state.coverage.total_active, 2);
  assertEquals(state.messages, []);
  assertEquals(state.patient_summary, null);
  assertEquals("participant_id" in state, false);

  const updated = (await (await handleSessionState({ db }, {
    resume_token: start.resume_token,
    action: "update_intake",
    fields: { display_name: "Lulu", preferred_language: "en" },
  })).json()) as SessionStateResponse;
  assertEquals(updated.participant.display_name, "Lulu");
  assertEquals(updated.language, "en");

  const consented = (await (await handleSessionState({ db }, {
    resume_token: start.resume_token,
    action: "consent",
    consent_variant: "guardian",
  })).json()) as SessionStateResponse;
  assertEquals(consented.status, "consented");
  assertEquals(db.sessions[0].consent_variant, "guardian");
  assert(db.sessions[0].consent_given_at);
  assert(db.audit.some((a) => a.action === "session.consent" && a.actor_type === "participant"));

  // Minor answering for themselves → minor-assent; adult self → adult.
  const minorSelf =
    (await (await handleStartSession(deps, req("good-jwt"), { ...body, respondent: "self" }))
      .json()) as StartSessionResponse;
  assertEquals(
    ((await (await handleSessionState({ db }, { resume_token: minorSelf.resume_token }))
      .json()) as SessionStateResponse).consent_variant_needed,
    "minor-assent",
  );
  const adult = (await (await handleStartSession(deps, req("good-jwt"), {
    ...body,
    respondent: "self",
    participant: { ...body.participant, age_band: "50-69" },
  })).json()) as StartSessionResponse;
  assertEquals(
    ((await (await handleSessionState({ db }, { resume_token: adult.resume_token }))
      .json()) as SessionStateResponse).consent_variant_needed,
    "adult",
  );

  const bad = await handleSessionState({ db }, { resume_token: "nope" }).catch((e) => e);
  assertEquals(bad.status, 401);
});
