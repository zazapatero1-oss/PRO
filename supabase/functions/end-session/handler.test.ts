import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { handleEndSession } from "./handler.ts";
import { handleConfirmSummary } from "../confirm-summary/handler.ts";
import { handleExportSession } from "../export-session/handler.ts";
import { FakeAnthropic, fakeAuth, seedSession } from "../_shared/testing.ts";
import type { EndSessionResponse } from "../_shared/types.ts";

async function activeSessionWithEvidence() {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    language: "es",
  });
  const m = await s.db.insertMessage({
    session_id: s.session.id,
    seq: 1,
    role: "patient",
    content: "No me gusta mi nariz",
    input_mode: "text",
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  await s.db.insertEvidence({
    session_id: s.session.id,
    construct_id: "appearance.nose",
    message_id: m.id,
    patient_quote: "No me gusta mi nariz",
    quote_gloss_en: "I don't like my nose",
    severity: "moderate",
    confidence: 0.8,
    interference: ["social"],
    note: null,
    superseded_by: null,
  });
  await s.db.insertEvidence({
    session_id: s.session.id,
    construct_id: "appearance.overall",
    message_id: m.id,
    patient_quote: "en general bien",
    quote_gloss_en: "overall fine",
    severity: "none",
    confidence: 0.9,
    interference: [],
    note: null,
    superseded_by: null,
  });
  await s.db.insertFinding({
    session_id: s.session.id,
    construct_id: "appearance.nose",
    finding: "Worse in photos",
    category: "triggers",
    message_id: m.id,
  });
  return s;
}

const narrative =
  '{"domains":[{"id":"appearance","summary_en":"Dislikes nose; otherwise content."}],"needs_clarification":[],"change_notes":[]}';

Deno.test("end-session (patient token): stores profile + patient summary, status summary-review, tokens/cost", async () => {
  const s = await activeSessionWithEvidence();
  const anthropic = new FakeAnthropic([{ text: narrative }, {
    text:
      "Esto es lo que escuché:\n- Tu nariz te molesta en las fotos.\n¿Lo entendí bien? Puede corregir cualquier cosa.",
  }]);
  const deps = {
    db: s.db,
    auth: fakeAuth({}),
    anthropic,
    model: "claude-sonnet-5",
    promptVersion: "v1",
  };
  const res = await handleEndSession(deps, new Request("http://x"), { resume_token: s.token });
  assertEquals(res.status, 200);
  const out = (await res.json()) as EndSessionResponse;
  assertEquals(out.status, "summary-review");
  assertStringIncludes(out.patient_summary, "¿Lo entendí bien?");
  const session = s.db.sessions[0];
  assertEquals(session.status, "summary-review");
  assert(session.ended_at);
  assertEquals(session.input_tokens, 200);
  assertEquals(session.cost_usd_estimate, 0.0008);
  const profile = s.db.profiles[0].profile;
  assertEquals(profile.generated_with, {
    model: "claude-sonnet-5",
    prompt_version: "v1",
    map: "test-map@1",
  });
  const appearance = profile.domains.find((d) => d.id === "appearance")!;
  assertEquals(appearance.severity, "moderate");
  assertEquals(appearance.worst_severity, "moderate");
  assertEquals(appearance.summary_en, "Dislikes nose; otherwise content.");
  assertEquals(appearance.constructs.find((c) => c.id === "appearance.nose")!.quotes[0], {
    text: "No me gusta mi nariz",
    lang: "es",
    gloss_en: "I don't like my nose",
  });
  assertEquals(profile.not_covered, ["psych.self_consciousness", "psych.mood"]);
  assert(s.db.audit.some((a) => a.action === "session.end"));
  // Idempotent second call.
  const again = await handleEndSession(deps, new Request("http://x"), { resume_token: s.token });
  assertEquals(((await again.json()) as EndSessionResponse).patient_summary, out.patient_summary);
  assertEquals(anthropic.calls.length, 2);
});

Deno.test("end-session: computes change_from_prior against the prior completed session", async () => {
  const s = await activeSessionWithEvidence();
  await s.db.updateSession(s.session.id, { timepoint: "post-op-6w" });
  const prior = await s.db.insertSession({
    ...s.session,
    id: undefined,
    status: "completed",
    timepoint: "baseline",
    ended_at: "2025-12-01T00:00:00Z",
    resume_token_hash: "x",
  });
  await s.db.upsertProfile({
    session_id: prior.id,
    profile: {
      generated_with: { model: "m", prompt_version: "v", map: "x" },
      domains: [{
        id: "appearance",
        label: "A",
        severity: "severe",
        confidence: 1,
        summary_en: "",
        constructs: [{
          id: "appearance.nose",
          label: "N",
          severity: "severe",
          confidence: 1,
          quotes: [],
          findings: [],
          status: "covered",
        }],
      }],
      needs_clarification: [],
      not_covered: [],
      declined: [],
      patient_questions: [],
      change_from_prior: [],
      disclaimer: "",
    },
    patient_summary: "",
    patient_summary_confirmed_at: null,
    patient_corrections: null,
  });
  const anthropic = new FakeAnthropic([{
    text:
      '{"domains":[],"needs_clarification":[],"change_notes":[{"construct_id":"appearance.nose","note":"Less bothered now."}]}',
  }, { text: "resumen" }]);
  await handleEndSession(
    { db: s.db, auth: fakeAuth({}), anthropic, model: "m", promptVersion: "v" },
    new Request("http://x"),
    { resume_token: s.token },
  );
  const profile = s.db.profiles.find((p) => p.session_id === s.session.id)!.profile;
  assertEquals(profile.change_from_prior, [{
    construct_id: "appearance.nose",
    prior: "severe",
    now: "moderate",
    note: "Less bothered now.",
  }]);
});

Deno.test("end-session: model failures fall back to deterministic summaries; status guards", async () => {
  const s = await activeSessionWithEvidence();
  const anthropic = new FakeAnthropic([new Error("down"), new Error("down"), new Error("down")]);
  const res = await handleEndSession(
    { db: s.db, auth: fakeAuth({}), anthropic, model: "m", promptVersion: "v" },
    new Request("http://x"),
    { resume_token: s.token },
  );
  assertEquals(res.status, 200);
  assertStringIncludes(
    ((await res.json()) as EndSessionResponse).patient_summary,
    "Esto es lo que escuché",
  );
  const fresh = await seedSession({ status: "consented" });
  const err = await handleEndSession(
    { db: fresh.db, auth: fakeAuth({}), anthropic, model: "m", promptVersion: "v" },
    new Request("http://x"),
    { resume_token: fresh.token },
  ).catch((e) => e);
  assertEquals(err.status, 409);
});

Deno.test("confirm-summary: corrections re-extract evidence, supersede old rows, regenerate profile, complete", async () => {
  const s = await activeSessionWithEvidence();
  const endClient = new FakeAnthropic([{ text: narrative }, { text: "resumen" }]);
  await handleEndSession(
    { db: s.db, auth: fakeAuth({}), anthropic: endClient, model: "m", promptVersion: "v" },
    new Request("http://x"),
    { resume_token: s.token },
  );
  const oldNose = s.db.evidence.find((e) => e.construct_id === "appearance.nose")!;

  const confirmClient = new FakeAnthropic([
    // correction 1 (named construct): model re-extracts as "mild"
    {
      text:
        '{"items":[{"construct_id":"appearance.nose","patient_quote":"solo un poco","quote_gloss_en":"just a little","severity":"mild","confidence":0.9,"interference":[]}]}',
    },
    // correction 2 (no construct): model picks the construct itself
    {
      text:
        '{"items":[{"construct_id":"psych.self_consciousness","patient_quote":"me miran mucho","quote_gloss_en":"people stare a lot","severity":"moderate","confidence":0.8,"interference":["social"]}]}',
    },
    // regenerated profile narrative
    {
      text:
        '{"domains":[{"id":"appearance","summary_en":"Updated."}],"needs_clarification":[],"change_notes":[]}',
    },
  ]);
  const res = await handleConfirmSummary({
    db: s.db,
    anthropic: confirmClient,
    model: "m",
    promptVersion: "v",
  }, {
    resume_token: s.token,
    confirmed: true,
    corrections: [
      { construct_id: "appearance.nose", patient_text: "En realidad solo un poco, no tanto" },
      { construct_id: null, patient_text: "Y siento que me miran mucho" },
    ],
  });
  assertEquals(await res.json(), { status: "completed" });
  assertEquals(s.db.sessions[0].status, "completed");
  assertEquals(oldNose.superseded_by !== null, true);
  const newNose = s.db.evidence.find((e) => e.id === oldNose.superseded_by)!;
  assertEquals(newNose.severity, "mild");
  assertEquals(s.db.messages.filter((m) => m.role === "patient").length, 3);
  assertEquals(newNose.message_id, s.db.messages[1].id);
  const profileRow = s.db.profiles[0];
  assert(profileRow.patient_summary_confirmed_at);
  assertEquals(profileRow.patient_corrections?.corrections.length, 2);
  assertEquals(profileRow.patient_corrections?.extracted.length, 2);
  assertEquals(profileRow.profile.domains.find((d) => d.id === "appearance")!.severity, "mild");
  assertEquals(
    profileRow.profile.domains.find((d) => d.id === "appearance")!.summary_en,
    "Updated.",
  );
  assertEquals(
    profileRow.profile.domains.find((d) => d.id === "psychological")!.severity,
    "moderate",
  );
  assert(s.db.audit.some((a) => a.action === "session.confirm_summary"));
  // Idempotent.
  assertEquals(
    await (await handleConfirmSummary({
      db: s.db,
      anthropic: confirmClient,
      model: "m",
      promptVersion: "v",
    }, { resume_token: s.token, confirmed: true, corrections: [] })).json(),
    { status: "completed" },
  );
});

Deno.test("confirm-summary: no corrections just confirms; wrong status is a 409", async () => {
  const s = await activeSessionWithEvidence();
  const err = await handleConfirmSummary({
    db: s.db,
    anthropic: new FakeAnthropic([]),
    model: "m",
    promptVersion: "v",
  }, { resume_token: s.token, confirmed: true, corrections: [] }).catch((e) => e);
  assertEquals(err.status, 409);
  await handleEndSession(
    {
      db: s.db,
      auth: fakeAuth({}),
      anthropic: new FakeAnthropic([{ text: narrative }, { text: "ok" }]),
      model: "m",
      promptVersion: "v",
    },
    new Request("http://x"),
    { resume_token: s.token },
  );
  const client = new FakeAnthropic([]);
  await handleConfirmSummary({ db: s.db, anthropic: client, model: "m", promptVersion: "v" }, {
    resume_token: s.token,
    confirmed: true,
    corrections: [],
  });
  assertEquals(client.calls.length, 0);
  assertEquals(s.db.sessions[0].status, "completed");
  assertEquals(s.db.profiles[0].patient_corrections, null);
});

Deno.test("export-session: clinician auth, fhir + csv with Content-Disposition, audit rows", async () => {
  const s = await activeSessionWithEvidence();
  await handleEndSession(
    {
      db: s.db,
      auth: fakeAuth({}),
      anthropic: new FakeAnthropic([{ text: narrative }, { text: "ok" }]),
      model: "m",
      promptVersion: "v",
    },
    new Request("http://x"),
    { resume_token: s.token },
  );
  s.db.clinicians.push({ id: "clin-1", display_name: "Dr", created_at: "" });
  const deps = { db: s.db, auth: fakeAuth({ jwt: "clin-1" }) };
  const fhir = await handleExportSession(
    deps,
    new Request(`http://x/export-session?session_id=${s.session.id}&format=fhir`, {
      headers: { authorization: "Bearer jwt" },
    }),
  );
  assertEquals(fhir.status, 200);
  assertStringIncludes(
    fhir.headers.get("content-disposition")!,
    'filename="P-0001_baseline_inferred-profile.fhir.json"',
  );
  const bundle = (await fhir.json()) as { entry: { resource: { resourceType: string } }[] };
  assertEquals(bundle.entry.filter((e) => e.resource.resourceType === "Observation").length, 2);
  const csv = await handleExportSession(
    deps,
    new Request(`http://x/export-session?session_id=${s.session.id}&format=csv`, {
      headers: { authorization: "Bearer jwt" },
    }),
  );
  assertStringIncludes(csv.headers.get("content-type")!, "text/csv");
  assertEquals((await csv.text()).trim().split("\r\n").length, 5);
  assertEquals(s.db.audit.filter((a) => a.action.startsWith("session.export.")).length, 2);
  const noAuth = await handleExportSession(
    deps,
    new Request(`http://x/export-session?session_id=${s.session.id}&format=csv`),
  ).catch((e) => e);
  assertEquals(noAuth.status, 401);
});
