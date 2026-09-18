import { assertEquals, assertRejects } from "@std/assert";
import { completeJson, parseJsonLoose, streamTurn } from "./anthropic.ts";
import { buildToolDefinitions } from "./prompt.ts";
import { FakeAnthropic } from "./testing.ts";

Deno.test("streamTurn: runs the tool loop, feeds tool_result back, stops at end_turn", async () => {
  const client = new FakeAnthropic([
    {
      text: "Let me note that.",
      toolUses: [{ name: "record_evidence", input: { construct_id: "a" } }, {
        name: "record_probe_finding",
        input: { construct_id: "a" },
      }],
    },
    { text: "Thanks for sharing." },
  ]);
  const deltas: string[] = [];
  const executed: string[] = [];
  const result = await streamTurn({
    client,
    model: "fake",
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: buildToolDefinitions(),
    maxTokens: 600,
    onText: (d) => deltas.push(d),
    onToolUse: (name) => {
      executed.push(name);
      return Promise.resolve({ content: "ok" });
    },
  });
  assertEquals(executed, ["record_evidence", "record_probe_finding"]);
  assertEquals(result.rounds, 2);
  assertEquals(result.text, "Let me note that.Thanks for sharing.");
  assertEquals(deltas.join(""), result.text);
  assertEquals(result.usage, { input_tokens: 200, output_tokens: 40 });
  assertEquals(result.stopReason, "end_turn");
  // Second call carries assistant tool_use + user tool_result (both results in ONE user message).
  const second = client.calls[1].params.messages;
  assertEquals(second.length, 3);
  assertEquals(second[1].role, "assistant");
  assertEquals(second[2].role, "user");
  const results = second[2].content as { type: string; tool_use_id: string; content: string }[];
  assertEquals(results.length, 2);
  assertEquals(results.every((r) => r.type === "tool_result"), true);
});

Deno.test("streamTurn: caps at 3 rounds even if the model keeps calling tools", async () => {
  const client = new FakeAnthropic([
    { toolUses: [{ name: "record_evidence", input: {} }] },
    { toolUses: [{ name: "record_evidence", input: {} }] },
    { toolUses: [{ name: "record_evidence", input: {} }] },
    { text: "never reached" },
  ]);
  let calls = 0;
  const result = await streamTurn({
    client,
    model: "fake",
    system: "",
    messages: [{ role: "user", content: "hi" }],
    tools: [],
    maxTokens: 10,
    onText: () => {},
    onToolUse: () => {
      calls++;
      return Promise.resolve({ content: "ok" });
    },
  });
  assertEquals(result.rounds, 3);
  assertEquals(calls, 3);
  assertEquals(result.stopReason, "tool_use");
});

Deno.test("streamTurn: a tool that throws becomes an is_error tool_result; refusal skips tools", async () => {
  const client = new FakeAnthropic([
    { toolUses: [{ name: "end_session", input: {} }] },
    { text: "bye" },
  ]);
  const result = await streamTurn({
    client,
    model: "fake",
    system: "",
    messages: [{ role: "user", content: "hi" }],
    tools: [],
    maxTokens: 10,
    onText: () => {},
    onToolUse: () => Promise.reject(new Error("db down")),
  });
  assertEquals(result.toolCalls[0].result.is_error, true);
  const refusing = new FakeAnthropic([{
    toolUses: [{ name: "x", input: {} }],
    stopReason: "refusal",
  }]);
  let ran = false;
  await streamTurn({
    client: refusing,
    model: "fake",
    system: "",
    messages: [{ role: "user", content: "hi" }],
    tools: [],
    maxTokens: 10,
    onText: () => {},
    onToolUse: () => {
      ran = true;
      return Promise.resolve({ content: "" });
    },
  });
  assertEquals(ran, false);
});

Deno.test("parseJsonLoose: fences and leading prose", () => {
  assertEquals(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(parseJsonLoose('Here you go:\n{"a":[1,2]} thanks'), { a: [1, 2] });
  assertEquals(parseJsonLoose("[1]"), [1]);
});

Deno.test("completeJson: retries once on invalid JSON, then throws", async () => {
  const client = new FakeAnthropic([{ text: "not json" }, { text: '{"ok":true}' }]);
  const res = await completeJson<{ ok: boolean }>({
    client,
    model: "fake",
    system: "s",
    user: "u",
    maxTokens: 100,
  });
  assertEquals(res.value.ok, true);
  assertEquals(res.attempts, 2);
  assertEquals(client.calls[1].params.messages.length, 3);
  const bad = new FakeAnthropic([{ text: "nope" }, { text: "still nope" }]);
  await assertRejects(() =>
    completeJson({ client: bad, model: "fake", system: "s", user: "u", maxTokens: 100 })
  );
});
