import { assertEquals } from "@std/assert";
import { AsyncQueue, formatSseEvent, parseSseText, sseResponse } from "./sse.ts";
import type { SseEvent } from "./types.ts";

Deno.test("formatSseEvent: exact SPEC §7.6 wire format", () => {
  assertEquals(
    formatSseEvent({ event: "token", data: { t: "hi" } }),
    'event: token\ndata: {"t":"hi"}\n\n',
  );
  assertEquals(
    formatSseEvent({
      event: "status",
      data: { coverage: { covered: 2, total_active: 9 }, turns_used: 3, max_turns: 40 },
    }),
    'event: status\ndata: {"coverage":{"covered":2,"total_active":9},"turns_used":3,"max_turns":40}\n\n',
  );
  assertEquals(
    formatSseEvent({ event: "ended", data: { reason: "turn_budget" } }),
    'event: ended\ndata: {"reason":"turn_budget"}\n\n',
  );
});

Deno.test("sseResponse: streams events in order with the event-stream content type", async () => {
  async function* gen(): AsyncGenerator<SseEvent> {
    yield { event: "token", data: { t: "a" } };
    yield { event: "evidence", data: { construct_id: "x", severity: "mild", confidence: 0.8 } };
    yield { event: "safety", data: { message: "m" } };
  }
  const res = sseResponse(gen());
  assertEquals(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const events = parseSseText(await res.text());
  assertEquals(events.map((e) => e.event), ["token", "evidence", "safety"]);
});

Deno.test("sseResponse: a throwing generator ends with a retryable error event", async () => {
  async function* gen(): AsyncGenerator<SseEvent> {
    yield { event: "token", data: { t: "a" } };
    throw new Error("boom");
  }
  const events = parseSseText(await sseResponse(gen()).text());
  assertEquals(events[1].event, "error");
  assertEquals((events[1].data as { retryable: boolean }).retryable, true);
});

Deno.test("AsyncQueue: delivers pushed items and terminates on close", async () => {
  const q = new AsyncQueue<number>();
  q.push(1);
  const out: number[] = [];
  const consumer = (async () => {
    for await (const v of q) out.push(v);
  })();
  q.push(2);
  await new Promise((r) => setTimeout(r, 1));
  q.push(3);
  q.close();
  await consumer;
  assertEquals(out, [1, 2, 3]);
});
