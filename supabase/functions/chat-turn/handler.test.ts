import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { handleChatTurn } from "./handler.ts";
import { parseSseText } from "../_shared/sse.ts";
import { FakeAnthropic, seedSession, systemText } from "../_shared/testing.ts";
import type { SseEvent } from "../_shared/types.ts";

async function turn(
  seeded: Awaited<ReturnType<typeof seedSession>>,
  anthropic: FakeAnthropic,
  text: string | null,
  opts: { now?: () => Date; input_mode?: "text" | "voice" } = {},
): Promise<{ status: number; events: SseEvent[]; json?: unknown }> {
  const res = await handleChatTurn(
    { db: seeded.db, anthropic, model: "fake-model", now: opts.now },
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

Deno.test("chat-turn: opening message moves consented → active, streams tokens, emits status", async () => {
  const s = await seedSession();
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
  const st = events[2].data as {
    coverage: { covered: number; total_active: number };
    turns_used: number;
    max_turns: number;
  };
  assertEquals(st, { coverage: { covered: 0, total_active: 4 }, turns_used: 1, max_turns: 40 });

  const session = s.db.sessions[0];
  assertEquals(session.status, "active");
  assert(session.started_at);
  assertEquals(session.input_tokens, 100);
  assertEquals(session.output_tokens, 20);
  assertEquals(s.db.messages.length, 1);
  assertEquals(s.db.messages[0].role, "assistant");
  assertEquals(s.db.messages[0].tokens_out, 20);
  assert((s.db.messages[0].latency_ms ?? -1) >= 0);

  // The synthetic session-start user message precedes the model call; system prompt has our sections.
  const call = anthropic.calls[0].params;
  assertEquals(call.messages[0].role, "user");
  assertStringIncludes(systemText(call.system), "# Coverage status");
  assertEquals((call.tools as { name: string }[]).length, 5);
  assertEquals(call.max_tokens, 1500);
});

Deno.test("chat-turn: happy path records evidence via tools and emits evidence events", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  await s.db.insertMessage({
    session_id: s.session.id,
    seq: 1,
    role: "assistant",
    content: "Hi! How are things?",
    input_mode: null,
    tokens_in: 1,
    tokens_out: 1,
    latency_ms: 1,
  });
  const anthropic = new FakeAnthropic([
    {
      toolUses: [
        {
          name: "record_evidence",
          input: {
            construct_id: "appearance.nose",
            patient_quote: "I hate my nose in photos",
            quote_gloss_en: "I hate my nose in photos",
            severity: "moderate",
            confidence: 0.85,
            interference: ["social"],
            note: "avoidance",
          },
        },
        {
          name: "record_evidence",
          input: {
            construct_id: "not.a.construct",
            patient_quote: "x",
            quote_gloss_en: "x",
            severity: "mild",
            confidence: 0.9,
            interference: [],
          },
        },
      ],
    },
    { text: "That sounds hard. When is it worst?" },
  ]);
  const { events } = await turn(s, anthropic, "I hate my nose in photos", { input_mode: "voice" });
  assertEquals(events.map((e) => e.event), ["evidence", "token", "token", "status"]);
  assertEquals(events[0].data, {
    construct_id: "appearance.nose",
    severity: "moderate",
    confidence: 0.85,
  });
  assertEquals((events[3].data as { coverage: { covered: number } }).coverage.covered, 1);

  assertEquals(s.db.evidence.length, 1);
  assertEquals(s.db.evidence[0].message_id, s.db.messages[1].id);
  assertEquals(s.db.messages[1].role, "patient");
  assertEquals(s.db.messages[1].input_mode, "voice");
  assertEquals(s.db.messages[2].role, "assistant");
  // The invalid tool call came back as an error tool_result, not a crash.
  const second = anthropic.calls[1].params.messages;
  const results = second[second.length - 1].content as { is_error?: boolean }[];
  assertEquals(results[1].is_error, true);
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
  assertEquals(s.db.flags.length, 1);
  assertEquals(s.db.flags[0].trigger, "self_harm");
  assertEquals(s.db.flags[0].detected_by, "keyword");
  assertEquals(s.db.flags[0].message_id, s.db.messages[0].id);
  assert(s.db.audit.some((a) => a.action === "session.safety_halt"));

  // Further turns are refused until a clinician reopens.
  const again = await turn(s, anthropic, "hola");
  assertEquals(again.status, 409);
  assertEquals((again.json as { error: { code: string } }).error.code, "safety_halted");
});

Deno.test("chat-turn: model-raised safety flag halts after the turn", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([
    {
      toolUses: [{
        name: "raise_safety_flag",
        input: { trigger: "abuse", rationale: "described being hit" },
      }],
    },
    { text: "Thank you for telling me." },
  ]);
  const { events } = await turn(s, anthropic, "things at home have been rough");
  assertEquals(events.map((e) => e.event), ["token", "token", "safety"]);
  assertEquals(s.db.sessions[0].status, "safety-halted");
  assertEquals(s.db.flags[0].detected_by, "model");
  assertEquals(s.db.flags[0].trigger, "abuse");
});

Deno.test("chat-turn: stop → ended(patient_requested) without a model call", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([]);
  const { events } = await turn(s, anthropic, "I want to stop");
  assertEquals(events.map((e) => e.event), ["token", "ended"]);
  assertEquals(events[1].data, { reason: "patient_requested" });
  assertEquals(s.db.sessions[0].status, "wrapping-up");
  assertEquals(anthropic.calls.length, 0);
});

Deno.test("chat-turn: pause keeps the session active and returns resume text", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const { events } = await turn(s, new FakeAnthropic([]), "take a break");
  assertEquals(events.map((e) => e.event), ["token", "status"]);
  assertEquals(s.db.sessions[0].status, "active");
  assertEquals(s.db.messages[1].role, "assistant");
});

Deno.test("chat-turn: skip marks the current construct declined deterministically, then continues", async () => {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    focus: ["appearance.nose"],
  });
  const anthropic = new FakeAnthropic([{ text: "No problem, let's talk about something else." }]);
  const { events } = await turn(s, anthropic, "skip");
  assertEquals(events[events.length - 1].event, "status");
  // Diagnosis focus narrows the active set to appearance.nose, so that is the "current" topic.
  const declined = s.db.evidence.filter((e) => e.severity === "declined");
  assertEquals(declined.length, 1);
  assertEquals(declined[0].construct_id, "appearance.nose");
  assertStringIncludes(systemText(anthropic.calls[0].params.system), "# This turn");
  assertStringIncludes(systemText(anthropic.calls[0].params.system), "declined the current topic");
});

Deno.test("chat-turn: end_session tool → wrapping-up + ended", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([
    {
      text: "Thanks so much, take care!",
      toolUses: [{ name: "end_session", input: { reason: "coverage_complete" } }],
    },
    { text: "" },
  ]);
  const { events } = await turn(s, anthropic, "that's everything");
  assertEquals(events.map((e) => e.event), ["token", "token", "status", "ended"]);
  assertEquals(events[3].data, { reason: "coverage_complete" });
  assertEquals(s.db.sessions[0].status, "wrapping-up");
});

Deno.test("chat-turn: budget exhausted forces a final turn and ended(turn_budget)", async () => {
  const s = await seedSession({
    status: "active",
    startedAt: new Date().toISOString(),
    maxTurns: 2,
  });
  await s.db.insertMessage({
    session_id: s.session.id,
    seq: 1,
    role: "assistant",
    content: "a",
    input_mode: null,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  await s.db.insertMessage({
    session_id: s.session.id,
    seq: 2,
    role: "assistant",
    content: "b",
    input_mode: null,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  const anthropic = new FakeAnthropic([{ text: "Thank you, we'll stop here." }]);
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
  const anthropic = new FakeAnthropic([{ text: "Let's start wrapping up." }]);
  await turn(s, anthropic, "hello", { now: () => new Date(start.getTime() + 8.5 * 60000) });
  assertStringIncludes(
    systemText(anthropic.calls[0].params.system),
    "Begin wrapping up; do not open new topics.",
  );
  assertEquals(s.db.sessions[0].status, "active");
});

Deno.test("chat-turn: model failure yields a retryable error event; retry reuses the patient message", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([new Error("network"), { text: "Back now." }]);
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
});

Deno.test("chat-turn: model safety layer halts when patterns miss (detected_by model)", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([{
    text: '{"trigger":"self_harm","rationale":"passive ideation"}',
  }]);
  const res = await handleChatTurn(
    { db: s.db, anthropic, model: "fake-model", safetyModel: "fake-safety" },
    {
      session_id: s.session.id,
      resume_token: s.token,
      text: "some days I think everyone would be fine if I just wasn't around",
      input_mode: "text",
    },
  );
  const events = parseSseText(await res.text());
  assertEquals(events[0].event, "safety");
  assertEquals(anthropic.calls.map((c) => c.kind), ["create"]);
  assertEquals(s.db.flags[0].detected_by, "model");
  assertEquals(s.db.sessions[0].status, "safety-halted");
});

Deno.test("chat-turn: model safety layer clears → conversation proceeds", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([{ text: '{"trigger":null,"rationale":"idiom"}' }, {
    text: "Ouch, that sounds sore.",
  }]);
  const res = await handleChatTurn(
    { db: s.db, anthropic, model: "fake-model", safetyModel: "fake-safety" },
    {
      session_id: s.session.id,
      resume_token: s.token,
      text: "this scar is killing me",
      input_mode: "text",
    },
  );
  const events = parseSseText(await res.text());
  assertEquals(anthropic.calls.map((c) => c.kind), ["create", "stream"]);
  assert(events.some((e) => e.event === "token"));
  assertEquals(s.db.flags.length, 0);
});

Deno.test("chat-turn: system prompt is sent as a cached stable block plus a dynamic tail", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const anthropic = new FakeAnthropic([{ text: "Hello" }]);
  await turn(s, anthropic, "hi");
  const system = anthropic.calls[0].params.system as { text: string; cache_control?: unknown }[];
  assertEquals(system.length, 2);
  assertEquals(system[0].cache_control, { type: "ephemeral" });
  assertStringIncludes(system[0].text, "# Role");
  assertEquals(system[1].cache_control, undefined);
  assertStringIncludes(system[1].text, "# Coverage status");
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
