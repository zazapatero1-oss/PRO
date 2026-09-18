// Second safety layer (SPEC §7.4): a small, independent model call that screens every patient
// message for risk in any language. It runs after the regex layer and before the conversation
// model, and fails open (returns null) on any error so the regex layer remains the floor.

import { completeJson } from "./anthropic.ts";
import type { AnthropicClientLike, SafetyTrigger } from "./types.ts";

export interface SafetyClassification {
  trigger: Exclude<SafetyTrigger, "other">;
  rationale: string;
}

export const SAFETY_CLASSIFIER_SYSTEM =
  `You are a safety screen for a health-care conversation about facial appearance and function. You read the patient's latest message (with a little context) and decide whether it indicates a genuine risk that a clinician must be told about now.

Flag "self_harm" for any expression of wanting to die, not wanting to be alive, wishing to disappear, or intent or thoughts of hurting oneself — including passive, indirect or hedged phrasing, in any language.
Flag "abuse" for being hurt, threatened, controlled or frightened by another person.
Flag "acute_distress" for panic, breakdown, or being unable to cope right now.
Do NOT flag idioms ("this scar is killing me", "dying to see the result"), ordinary sadness or frustration, pain complaints, past events described as resolved, or fear about a procedure.

Answer with JSON only: {"trigger": "self_harm" | "abuse" | "acute_distress" | null, "rationale": "<at most 20 words>"}.`;

const TRIGGERS = new Set(["self_harm", "abuse", "acute_distress"]);

export async function classifySafety(opts: {
  client: AnthropicClientLike;
  model: string;
  text: string;
  recent: { role: string; content: string }[];
}): Promise<SafetyClassification | null> {
  const context = opts.recent.slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n");
  const user = `Context (most recent last):\n${
    context || "(none)"
  }\n\nLatest patient message:\n${opts.text}`;
  try {
    const r = await completeJson<SafetyClassification | null>({
      client: opts.client,
      model: opts.model,
      system: SAFETY_CLASSIFIER_SYSTEM,
      user,
      maxTokens: 120,
      validate: (v) => {
        const o = (v ?? {}) as Record<string, unknown>;
        if (o.trigger === null || o.trigger === undefined) return null;
        if (typeof o.trigger !== "string" || !TRIGGERS.has(o.trigger)) {
          throw new Error(`unknown trigger ${String(o.trigger)}`);
        }
        return {
          trigger: o.trigger as SafetyClassification["trigger"],
          rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 200) : "",
        };
      },
    });
    return r.value;
  } catch {
    return null;
  }
}
