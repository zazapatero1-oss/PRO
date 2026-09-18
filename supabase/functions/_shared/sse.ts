// text/event-stream helpers emitting the exact SPEC §7.6 event names and shapes.

import type { SseEvent } from "./types.ts";
import { corsHeaders } from "./errors.ts";

export function formatSseEvent(ev: SseEvent): string {
  return `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

/** Parses a raw event-stream body back into events (used by tests and the eval harness). */
export function parseSseText(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const chunk of text.split("\n\n")) {
    if (!chunk.trim()) continue;
    let event: string | undefined;
    const dataLines: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!event) continue;
    events.push({ event, data: JSON.parse(dataLines.join("\n")) } as SseEvent);
  }
  return events;
}

/**
 * Builds a streaming Response from an async iterable of events. Errors thrown by the
 * generator are converted into a terminal `error` event instead of a broken stream.
 */
export function sseResponse(
  events: AsyncIterable<SseEvent>,
  origin = "*",
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of events) {
          controller.enqueue(encoder.encode(formatSseEvent(ev)));
        }
      } catch (err) {
        console.error("sse generator failed", err);
        controller.enqueue(
          encoder.encode(
            formatSseEvent({
              event: "error",
              data: { retryable: true, message: "Something went wrong. Please try again." },
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
      ...corsHeaders(origin),
    },
  });
}

/**
 * Bridges callback-style producers (the Anthropic stream) to an async iterator so a
 * handler can `yield` events while work is still running.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
