// FakeAnthropic replies are consumed in call order. For one patient turn that order is:
//   1. the safety screen (`create`) — only when `safetyModel` is set,
//   2. the conversational reply (`stream`),
//   3. the extraction (`create`) — only when the turn has a patient message.
// Each test says which of the three it scripts.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { handleChatTurn } from "./handler.ts";
import { parseSseText } from "../_shared/sse.ts";
import { FakeAnthropic, seedSession, systemText } from "../_shared/testing.ts";
import type { ExtractionResult, SseEvent } from "../_shared/types.ts";
import { confirmationText } from "../_shared/tracker.ts";

type StatusData = {
  coverage: { covered: number; total_active: number };
  phase: string;
  current_focus: string | null;
  focus_progress: { confirmed: number; total: number };
  turns_used: number;
  max_turns: number;
};

/** A scripted extraction reply (the JSON the EXTRACT_MODEL would return). */
function extraction(partial: Partial<ExtractionResult>): { text: string } {
  return {
    text: JSON.stringify({
      evidence: [],
      findings: [],
      declined: [],
      triage_answered: [],
      confirmed: [],
      patient_questions: [],
      ...partial,
    }),
  };
}

async function turn(
  seeded: Awaited<ReturnType<typeof seedSession>>,
  anthropic: FakeAnthropic,
  text: string | null,
  opts: { now?: () => Date; input_mode?: "text" | "voice"; safetyModel?: string } = {},
): Promise<{ status: number; events: SseEvent[]; json?: unknown }> {
  const res = await handleChatTurn(
    {
      db: seeded.db,
      anthropic,
      model: "fake-model",
      extractModel: "fake-extract",
      safetyModel: opts.safetyModel,
      now: opts.now,
    },
    {
      session_id: seeded.session.id,
      resume_token: seeded.token,
      text,
      input_mode: opts.input_mode ?? "text",
    },
  );
  if (res.headers.get("content-type")?.startsWith("text/event-stream")) {
    return { status: res.status, events: parseSseText(await res.text()) };
  }
  return { status: res.status, events: [], json: await res.json() };
}

Deno.test("chat-turn: opening message is a triage turn with no tools and no extraction", async () => {
  const s = await seedSession();
  // Scripts: [stream]. No patient message, so no safety screen and no extraction.
  const anthropic = new FakeAnthropic([{
    text: "Hi Sam! How are things going for you at the moment?",
  }]);
  const { status, events } = await turn(s, anthropic, null);
  assertEquals(status, 200);
  assertEquals(events.map((e) => e.event), ["token", "token", "status"]);
  assertEquals(
    events.filter((e) => e.event === "token").map((e) => (e.data as { t: string }).t).join(""),
    "Hi Sam! How are things going for you at the moment?",
  );
  assertEquals(events[2].data as StatusData, {
    coverage: { covered: 0, total_active: 4 },
    phase: "triage",
    current_focus: null,
    focus_progress: { confirmed: 0, total: 0 },
    turns_used: 1,
    max_turns: 40,
  });

  const session = s.db.sessions[0];
  assertEquals(session.status, "active");
  assertEquals(session.phase, "triage");
  assert(session.started_at);
  assertEquals(session.input_tokens, 100);
  assertEquals(s.db.messages.length, 1);
  assertEquals(s.db.messages[0].role, "assistant");

  const call = anthropic.calls[0];
  assertEquals(call.kind, "stream");
  assertEquals(anthropic.calls.length, 1);
  // v1.1 §C: no tools, no tool_choice, tight output cap, triage guidance in the prompt.
  const params = call.params as { tools?: unknown; tool_choice?: unknown; max_tokens: number };
  assertEquals(params.tools, undefined);
  assertEquals(params.tool_choice, undefined);
  assertEquals(params.max_tokens, 250);
  const sys = systemText(call.params.system);
  assertStringIncludes(sys, "# This phase");
  assertStringIncludes(sys, "Ask about: How they feel overall about how their face looks");
  assert(!sys.includes("record_evidence"));
});

Deno.test("chat-turn: evidence events follow the reply; status carries phase and focus", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  await s.db.insertMessage({
    session_id: s.session.id,
    seq: 1,
    role: "assistant",
    content: "Hi! How are things with your face at the moment?",
    input_mode: null,
    tokens_in: 1,
    tokens_out: 1,
    latency_ms: 1,
  });
  // Scripts: [stream reply, extraction create].
  const anthropic = new FakeAnthropic([
    { text: "That sounds hard. When is it worst?" },
    extraction({
      evidence: [{
        construct_id: "appearance.nose",
        patient_quote: "I hate my nose in photos",
        quote_gloss_en: "I hate my nose in photos",
        severity: "moderate",
        confidence: 0.85,
        interference: ["social"],
        facets: ["shape", "not_a_facet"],
        triage_item: "features",
        note: "avoidance",
      }, {
        construct_id: "not.a.construct",
        patient_quote: "I hate my nose in photos",
        quote_gloss_en: "x",
        severity: "mild",
        confidence: 0.9,
        interference: [],
        facets: [],
      }, {
        construct_id: "appearance.overall",
        patient_quote: "words the patient never said",
        quote_gloss_en: "words the patient never said",
        severity: "severe",
        confidence: 0.9,
        interference: [],
        facets: [],
      }],
      findings: [{ construct_id: "appearance.nose", category: "impact", finding: "Avoids photos" }],
      triage_answered: ["features"],
      patient_questions: ["Is this swelling normal?"],
    }),
  ]);

  const { events } = await turn(s, anthropic, "I hate my nose in photos", {
    input_mode: "voice",
  });
  assertEquals(events.map((e) => e.event), ["token", "token", "evidence", "status"]);
  assertEquals(events[2].data, {
    construct_id: "appearance.nose",
    severity: "moderate",
    confidence: 0.85,
  });
  const status = events[3].data as StatusData;
  assertEquals(status.phase, "triage");
  assertEquals(status.coverage.covered, 1);
  assertEquals(status.turns_used, 2);

  // Only the valid, quoted row survived; facets and triage_item were filtered and stored.
  assertEquals(s.db.evidence.length, 1);
  assertEquals(s.db.evidence[0].construct_id, "appearance.nose");
  assertEquals(s.db.evidence[0].facets, ["shape"]);
  assertEquals(s.db.evidence[0].triage_item, "features");
  assertEquals(s.db.evidence[0].message_id, s.db.messages[1].id);
  assertEquals(s.db.findings.map((f) => f.category), ["impact", "patient_question"]);

  // The extraction call saw the question the patient was answering.
  assertEquals(anthropic.calls.map((c) => c.kind), ["stream", "create"]);
  const extractUser = anthropic.calls[1].params.messages[0].content as string;
  assertStringIncludes(extractUser, "How are things with your face at the moment?");
  assertStringIncludes(extractUser, "I hate my nose in photos");
  assertEquals(anthropic.calls[1].params.model, "fake-extract");
});

Deno.test("chat-turn: triage completion derives focus and moves the phase to explore", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  for (const item of ["overall", "features"]) {
    await s.db.insertEvidence({
      session_id: s.session.id,
      construct_id: item === "overall" ? "appearance.overall" : "appearance.nose",
      message_id: null,
      patient_quote: "q",
      quote_gloss_en: "q",
      severity: "moderate",
      confidence: 0.8,
      interference: [],
      facets: [],
      triage_item: item,
      note: null,
      superseded_by: null,
    });
  }
  // Scripts: [stream reply, extraction create].
  const anthropic = new FakeAnthropic([
    { text: "Thanks — tell me more about that." },
    extraction({
      evidence: [{
        construct_id: "psych.mood",
        patient_quote: "it gets me down",
        quote_gloss_en: "it gets me down",
        severity: "mild",
        confidence: 0.8,
        interference: [],
        facets: [],
        triage_item: "impact",
      }],
      triage_answered: ["impact"],
    }),
  ]);
  const { events } = await turn(s, anthropic, "it gets me down");
  const status = events[events.length - 1].data as StatusData;
  assertEquals(status.phase, "explore");
  // Equal severity: the specific feature the patient named comes before the "overall" summary.
  assertEquals(status.current_focus, "appearance.nose");
  assertEquals(status.focus_progress, { confirmed: 0, total: 3 });
  assertEquals(s.db.sessions[0].phase, "explore");
  assertEquals(s.db.sessions[0].focus_constructs, [
    "appearance.nose",
    "appearance.overall",
    "psych.mood",
  ]);
});

Deno.test("chat-turn: a confirmation closes the focus construct and the next one takes over", async () => {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    phase: "explore",
    focusConstructs: ["appearance.overall", "appearance.nose"],
  });
  await s.db.insertMessage({
    session_id: s.session.id,
    seq: 1,
    role: "assistant",
    content: "So the mirror is the hardest part — is that right?",
    input_mode: null,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  for (const item of ["overall", "features", "impact"]) {
    await s.db.insertEvidence({
      session_id: s.session.id,
      construct_id: "appearance.overall",
      message_id: null,
      patient_quote: "q",
      quote_gloss_en: "q",
      severity: "moderate",
      confidence: 0.8,
      interference: [],
      facets: ["mirror"],
      triage_item: item,
      note: null,
      superseded_by: null,
    });
  }
  // Scripts: [stream reply, extraction create].
  const anthropic = new FakeAnthropic([
    { text: "Got it. Can I ask about your nose now?" },
    extraction({ confirmed: ["appearance.overall"] }),
  ]);
  const { events } = await turn(s, anthropic, "yes, that's right");
  const status = events[events.length - 1].data as StatusData;
  assertEquals(status.current_focus, "appearance.nose");
  assertEquals(status.focus_progress, { confirmed: 1, total: 2 });

  const marker = s.db.findings.find((f) => f.construct_id === "appearance.overall");
  assertEquals(marker?.category, "other");
  assertEquals(
    marker?.finding,
    confirmationText("So the mirror is the hardest part — is that right?"),
  );
});

Deno.test("chat-turn: the tracker ends the session when every focus area is closed", async () => {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    phase: "explore",
    focusConstructs: ["appearance.overall"],
  });
  for (const item of ["overall", "features", "impact"]) {
    await s.db.insertEvidence({
      session_id: s.session.id,
      construct_id: "appearance.overall",
      message_id: null,
      patient_quote: "q",
      quote_gloss_en: "q",
      severity: "moderate",
      confidence: 0.8,
      interference: [],
      facets: ["mirror", "photos", "wanted_change"],
      triage_item: item,
      note: null,
      superseded_by: null,
    });
  }
  await s.db.insertFinding({
    session_id: s.session.id,
    construct_id: "appearance.overall",
    category: "other",
    finding: confirmationText("your face in the mirror"),
    message_id: null,
  });
  // Scripts: [stream goodbye, extraction create].
  const anthropic = new FakeAnthropic([
    { text: "Thank you so much — your care team will read this." },
    extraction({}),
  ]);
  const { events } = await turn(s, anthropic, "no, that's everything");
  assertEquals(events.map((e) => e.event), ["token", "token", "status", "ended"]);
  assertEquals(events[3].data, { reason: "coverage_complete" });
  assertEquals(s.db.sessions[0].status, "wrapping-up");
  assertStringIncludes(
    systemText(anthropic.calls[0].params.system),
    "This is the final message of the session",
  );
});

Deno.test("chat-turn: extraction failure still yields a status event and keeps the reply", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  // Scripts: [stream reply, extraction create ×2 (completeJson retries once), both invalid].
  const anthropic = new FakeAnthropic([
    { text: "Tell me more." },
    { text: "sorry, I can't do that" },
    { text: "still not JSON" },
  ]);
  const { events } = await turn(s, anthropic, "my chin bothers me");
  assertEquals(events.map((e) => e.event), ["token", "token", "status"]);
  assertEquals(s.db.evidence.length, 0);
  assertEquals(s.db.messages.filter((m) => m.role === "assistant").length, 1);
  assertEquals(s.db.sessions[0].phase, "triage");
});

Deno.test("chat-turn: keyword safety intercept halts before any model call (es, minor)", async () => {
  const s = await seedSession({
    language: "es",
    ageBand: "13-17",
    status: "active",
    startedAt: new Date().toISOString(),
  });
  const anthropic = new FakeAnthropic([]);
  const { events } = await turn(s, anthropic, "ya no quiero estar aquí");
  assertEquals(events.length, 1);
  assertEquals(events[0].event, "safety");
  assertStringIncludes((events[0].data as { message: string }).message, "adulto de confianza");
  assertEquals(anthropic.calls.length, 0);
  assertEquals(s.db.sessions[0].status, "safety-halted");
  assertEquals(s.db.flags[0].detected_by, "keyword");
  assert(s.db.audit.some((a) => a.action === "session.safety_halt"));

  const again = await turn(s, anthropic, "hola");
  assertEquals(again.status, 409);
  assertEquals((again.json as { error: { code: string } }).error.code, "safety_halted");
});

Deno.test("chat-turn: the safety screen runs beside the stream and halts after the reply", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  // Scripts: [safety create (flags), stream reply, extraction create]. Extraction runs beside
  // the reply; its result is discarded because the turn halts.
  const anthropic = new FakeAnthropic([
    { text: '{"trigger":"self_harm","rationale":"passive ideation"}' },
    { text: "I hear you. Thank you for telling me." },
    extraction({}),
  ]);
  const { events } = await turn(
    s,
    anthropic,
    "some days I think everyone would be fine if I just wasn't around",
    { safetyModel: "fake-safety" },
  );
  // The patient still gets the reply; the fixed message follows it.
  assertEquals(events.map((e) => e.event), ["token", "token", "safety"]);
  assertEquals(anthropic.calls.map((c) => c.kind), ["create", "stream", "create"]);
  assertEquals(s.db.flags[0].detected_by, "model");
  assertEquals(s.db.sessions[0].status, "safety-halted");
  assertEquals(s.db.evidence.length, 0);
  assertEquals(s.db.messages.filter((m) => m.role === "assistant").length, 2);
});

Deno.test("chat-turn: the safety screen clears → the turn continues into extraction", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  // Scripts: [safety create (clear), stream reply, extraction create].
  const anthropic = new FakeAnthropic([
    { text: '{"trigger":null,"rationale":"idiom"}' },
    { text: "Ouch, that sounds sore." },
    extraction({}),
  ]);
  const { events } = await turn(s, anthropic, "this scar is killing me", {
    safetyModel: "fake-safety",
  });
  assertEquals(anthropic.calls.map((c) => c.kind), ["create", "stream", "create"]);
  assert(events.some((e) => e.event === "token"));
  assertEquals(events[events.length - 1].event, "status");
  assertEquals(s.db.flags.length, 0);
});

Deno.test("chat-turn: stop → ended(patient_requested) without a model call", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([]);
  const { events } = await turn(s, anthropic, "I want to stop");
  assertEquals(events.map((e) => e.event), ["token", "ended"]);
  assertEquals(events[1].data, { reason: "patient_requested" });
  assertEquals(s.db.sessions[0].status, "wrapping-up");
  assertEquals(s.db.sessions[0].phase, "wrap-up");
  assertEquals(anthropic.calls.length, 0);
});

Deno.test("chat-turn: pause keeps the session active and returns resume text", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const { events } = await turn(s, new FakeAnthropic([]), "take a break");
  assertEquals(events.map((e) => e.event), ["token", "status"]);
  assertEquals(s.db.sessions[0].status, "active");
  assertEquals(s.db.messages[1].role, "assistant");
});

Deno.test("chat-turn: skip marks the current construct declined deterministically", async () => {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    focus: ["appearance.nose"],
  });
  // Scripts: [stream reply, extraction create].
  const anthropic = new FakeAnthropic([
    { text: "No problem, let's talk about something else." },
    extraction({}),
  ]);
  const { events } = await turn(s, anthropic, "skip");
  assertEquals(events[events.length - 1].event, "status");
  const declined = s.db.evidence.filter((e) => e.severity === "declined");
  assertEquals(declined.length, 1);
  assertEquals(declined[0].construct_id, "appearance.nose");
  assertStringIncludes(systemText(anthropic.calls[0].params.system), "# This turn");
  assertStringIncludes(systemText(anthropic.calls[0].params.system), "declined the current topic");
});

Deno.test("chat-turn: budget exhausted forces a final turn and ended(turn_budget)", async () => {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    maxTurns: 2,
  });
  for (const seq of [1, 2]) {
    await s.db.insertMessage({
      session_id: s.session.id,
      seq,
      role: "assistant",
      content: "a",
      input_mode: null,
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
    });
  }
  // Scripts: [stream goodbye, extraction create].
  const anthropic = new FakeAnthropic([{ text: "Thank you, we'll stop here." }, extraction({})]);
  const { events } = await turn(s, anthropic, "ok");
  assertEquals(events[events.length - 1].data, { reason: "turn_budget" });
  assertStringIncludes(systemText(anthropic.calls[0].params.system), "The budget is used up");
  assertEquals(s.db.sessions[0].status, "wrapping-up");
});

Deno.test("chat-turn: 80% budget by time adds the wrap-up instruction", async () => {
  const start = new Date("2026-01-01T10:00:00Z");
  const s = await seedSession({
    status: "active",
    startedAt: start.toISOString(),
    targetMinutes: 10,
  });
  // Scripts: [stream reply, extraction create].
  const anthropic = new FakeAnthropic([{ text: "Let's start wrapping up." }, extraction({})]);
  await turn(s, anthropic, "hello", { now: () => new Date(start.getTime() + 8.5 * 60000) });
  assertStringIncludes(
    systemText(anthropic.calls[0].params.system),
    "Begin wrapping up; do not open new topics.",
  );
  assertEquals(s.db.sessions[0].status, "active");
});

Deno.test("chat-turn: model failure yields a retryable error event; retry reuses the patient message", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  // Per attempt: [stream, extraction create]; the first stream fails.
  const anthropic = new FakeAnthropic([
    new Error("network"),
    extraction({}),
    { text: "Back now." },
    extraction({}),
  ]);
  const first = await turn(s, anthropic, "hello there");
  assertEquals(first.events.map((e) => e.event), ["error"]);
  assertEquals(s.db.messages.filter((m) => m.role === "patient").length, 1);
  const second = await turn(s, anthropic, "hello there");
  assertEquals(second.events[second.events.length - 1].event, "status");
  assertEquals(s.db.messages.filter((m) => m.role === "patient").length, 1);
  assertEquals(s.db.messages.filter((m) => m.role === "assistant").length, 1);
});

Deno.test("chat-turn: bad token / consent required / closed session are JSON errors", async () => {
  const s = await seedSession({ status: "intake" });
  const consent = await turn(s, new FakeAnthropic([]), "hi");
  assertEquals(consent.status, 409);
  assertEquals((consent.json as { error: { code: string } }).error.code, "consent_required");
  const bad = await handleChatTurn({ db: s.db, anthropic: new FakeAnthropic([]), model: "m" }, {
    session_id: s.session.id,
    resume_token: "wrong",
    text: "hi",
    input_mode: "text",
  });
  assertEquals(bad.status, 401);
  const done = await seedSession({ status: "completed" });
  const closed = await turn(done, new FakeAnthropic([]), "hi");
  assertEquals((closed.json as { error: { code: string } }).error.code, "session_closed");
});

Deno.test("chat-turn: non-baseline session injects the prior-session brief", async () => {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    timepoint: "post-op-6w",
  });
  const prior = await s.db.insertSession({
    ...s.session,
    id: undefined,
    status: "completed",
    timepoint: "baseline",
    ended_at: "2025-12-01T00:00:00Z",
    resume_token_hash: "other",
  });
  await s.db.upsertProfile({
    session_id: prior.id,
    profile: {
      generated_with: { model: "m", prompt_version: "v", map: "x" },
      domains: [{
        id: "appearance",
        label: "Appearance",
        severity: "severe",
        confidence: 0.9,
        summary_en: "Very unhappy with nose.",
        constructs: [],
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
  const anthropic = new FakeAnthropic([{ text: "Welcome back!" }]);
  await turn(s, anthropic, null);
  const sys = systemText(anthropic.calls[0].params.system);
  assertStringIncludes(sys, "## Prior-session brief");
  assertStringIncludes(sys, "Very unhappy with nose.");
  assertStringIncludes(sys, "outcome.decision");
  // The post-op triage item is active at this timepoint.
  assertStringIncludes(sys, "Opening screen: 0 of 4 answered.");
});

Deno.test("chat-turn: system prompt is sent as a cached stable block plus a dynamic tail", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([{ text: "Hello" }, extraction({})]);
  await turn(s, anthropic, "hi");
  const system = anthropic.calls[0].params.system as { text: string; cache_control?: unknown }[];
  assertEquals(system.length, 2);
  assertEquals(system[0].cache_control, { type: "ephemeral" });
  assertStringIncludes(system[0].text, "# Role");
  assertEquals(system[1].cache_control, undefined);
  assertStringIncludes(system[1].text, "# This phase");
});

Deno.test("chat-turn: expired resume token is rejected", async () => {
  const s = await seedSession({
    status: "active",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  const { status, json } = await turn(s, new FakeAnthropic([]), "hi");
  assertEquals(status, 401);
  assertEquals((json as { error: { code: string } }).error.code, "token_expired");
});
