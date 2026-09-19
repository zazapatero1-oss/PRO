// Thin wrapper over the Anthropic SDK: streaming tool loop (≤3 rounds) and JSON completions.
// The client is injected (`AnthropicClientLike`) so tests run without network or a key.

import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicClientLike } from "./types.ts";

/**
 * Claude 5 models think by default; in a chat that spends the whole output budget before
 * the first visible word. Every call here is short-form, so thinking is off.
 */
export const NO_THINKING = { thinking: { type: "disabled" as const } };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface ToolExecResult {
  content: string;
  is_error?: boolean;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: ToolExecResult;
}

/**
 * Splits the system prompt into a cached stable prefix and an uncached dynamic tail.
 * Cache order is tools → system → messages, so the stable block must come first.
 */
export function cachedSystem(stable: string, dynamic: string): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamic },
  ];
}

export interface StreamTurnOptions {
  client: AnthropicClientLike;
  model: string;
  system: string | Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /** v1.1 §C: the conversational turn sends none; `tools` and `tool_choice` are then omitted. */
  tools: Anthropic.Tool[];
  maxTokens: number;
  onText: (delta: string) => void;
  onToolUse?: (name: string, input: unknown) => Promise<ToolExecResult>;
  /** Number of model calls, i.e. tool rounds + final answer. SPEC §7.3 says 3. */
  maxRounds?: number;
}

export interface StreamTurnResult {
  text: string;
  usage: Usage;
  stopReason: Anthropic.StopReason | null;
  rounds: number;
  toolCalls: ToolCallRecord[];
}

export function createAnthropicClient(apiKey: string, workspaceId?: string): AnthropicClientLike {
  // Keys that are not scoped to a workspace must name one on every request.
  return new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
}

export async function streamTurn(opts: StreamTurnOptions): Promise<StreamTurnResult> {
  const maxRounds = opts.maxRounds ?? 3;
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  const toolCalls: ToolCallRecord[] = [];
  let text = "";
  let stopReason: Anthropic.StopReason | null = null;
  let rounds = 0;

  const hasTools = opts.tools.length > 0;
  while (rounds < maxRounds) {
    rounds++;
    const stream = opts.client.messages.stream({
      ...NO_THINKING,
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
      ...(hasTools ? { tools: opts.tools } : {}),
    });
    stream.on("text", (delta) => {
      text += delta;
      opts.onText(delta);
    });
    const message = await stream.finalMessage();
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;
    stopReason = message.stop_reason;

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use"
    );
    // A refusal or truncation can cut a tool_use off mid-input; never run those tools.
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let result: ToolExecResult;
      try {
        result = opts.onToolUse
          ? await opts.onToolUse(tu.name, tu.input)
          : { content: "No tools are available in this call.", is_error: true };
      } catch (err) {
        result = { content: `Tool failed: ${(err as Error).message}`, is_error: true };
      }
      toolCalls.push({ name: tu.name, input: tu.input, result });
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result.content,
        ...(result.is_error ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "assistant", content: message.content });
    messages.push({ role: "user", content: results });
  }

  // Every round was tool calls, or the output cap cut a tool call off before any text:
  // ask once more with tools off so the patient always gets a reply. Only meaningful when
  // tools were sent at all; a tool-free call has nothing to turn off.
  // A tool-free call that came back empty (rare) gets one plain retry.
  if (!hasTools && !text.trim()) {
    console.error("streamTurn: empty reply; retrying once");
    rounds++;
    const stream = opts.client.messages.stream({
      ...NO_THINKING,
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
    });
    stream.on("text", (delta) => {
      text += delta;
      opts.onText(delta);
    });
    const message = await stream.finalMessage();
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;
    stopReason = message.stop_reason;
  }
  if (hasTools && !text.trim() && (stopReason === "tool_use" || stopReason === "max_tokens")) {
    rounds++;
    const stream = opts.client.messages.stream({
      ...NO_THINKING,
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
      tools: opts.tools,
      tool_choice: { type: "none" },
    });
    stream.on("text", (delta) => {
      text += delta;
      opts.onText(delta);
    });
    const message = await stream.finalMessage();
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;
    stopReason = message.stop_reason;
  }

  return { text, usage, stopReason, rounds, toolCalls };
}

// ---------------------------------------------------------------------------
// Non-streaming JSON completions
// ---------------------------------------------------------------------------

export interface CompleteJsonOptions<T> {
  client: AnthropicClientLike;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  /** Optional structural check; a throw counts as a parse failure and triggers the retry. */
  validate?: (value: unknown) => T;
}

export interface CompleteJsonResult<T> {
  value: T;
  usage: Usage;
  attempts: number;
}

export function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Strips ``` fences and leading prose, then parses the first balanced JSON value. */
export function parseJsonLoose(raw: string): unknown {
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // Fall back to the outermost {...} or [...] span.
    const start = s.search(/[[{]/);
    if (start < 0) throw new SyntaxError("no JSON value found");
    const open = s[start];
    const close = open === "{" ? "}" : "]";
    const end = s.lastIndexOf(close);
    if (end <= start) throw new SyntaxError("unbalanced JSON value");
    return JSON.parse(s.slice(start, end + 1));
  }
}

export async function completeJson<T = unknown>(
  opts: CompleteJsonOptions<T>,
): Promise<CompleteJsonResult<T>> {
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  const validate = opts.validate ?? ((v: unknown) => v as T);
  let lastError: unknown = null;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const message = await opts.client.messages.create({
      ...NO_THINKING,
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
    });
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;
    const text = extractText(message);
    try {
      return { value: validate(parseJsonLoose(text)), usage, attempts: attempt };
    } catch (err) {
      lastError = err;
      messages.push({ role: "assistant", content: text || "(empty)" });
      messages.push({
        role: "user",
        content:
          "That was not valid JSON matching the requested shape. Reply again with ONLY the JSON object, no prose, no code fences.",
      });
    }
  }
  throw new Error(`completeJson: invalid JSON after 2 attempts: ${(lastError as Error)?.message}`);
}

export function isRetryableAnthropicError(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) return (err.status ?? 500) >= 500;
  return false;
}
