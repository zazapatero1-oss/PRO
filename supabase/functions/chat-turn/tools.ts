// Executes the §7.3 tools against the DB with input validation. Model input is untrusted.

import type {
  ActiveConstruct,
  Db,
  EndReason,
  FindingCategory,
  RaiseSafetyFlagInput,
  RecordEvidenceInput,
  Severity,
} from "../_shared/types.ts";
import type { ToolExecResult } from "../_shared/anthropic.ts";

const SEVERITIES: Severity[] = ["none", "mild", "moderate", "severe", "unclear"];
const CATEGORIES: FindingCategory[] = [
  "onset",
  "trajectory",
  "triggers",
  "relief",
  "impact",
  "expectation",
  "patient_question",
  "other",
];
const INTERFERENCE = ["social", "work", "school", "sleep", "relationships", "daily-activities"];
const END_REASONS: EndReason[] = ["coverage_complete", "turn_budget", "patient_requested"];
const TRIGGERS = ["self_harm", "abuse", "acute_distress", "other"];

export interface ToolContext {
  db: Db;
  sessionId: string;
  /** The patient message this turn responds to (null on the opening turn). */
  messageId: string | null;
  activeConstructs: ActiveConstruct[];
  onEvidence: (e: { construct_id: string; severity: Severity; confidence: number }) => void;
  onEndSession: (reason: EndReason) => void;
  onSafetyFlag: (flag: RaiseSafetyFlagInput) => void;
}

function obj(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("input must be an object");
  }
  return input as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string, required = true): string {
  const v = o[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (!required) return "";
  throw new Error(`${key} is required`);
}

function constructId(o: Record<string, unknown>, active: ActiveConstruct[]): string {
  const id = str(o, "construct_id");
  if (!active.some((c) => c.id === id)) {
    throw new Error(`unknown construct_id "${id}"; use one of the active construct ids`);
  }
  return id;
}

export function validateEvidence(input: unknown, active: ActiveConstruct[]): RecordEvidenceInput {
  const o = obj(input);
  const severity = str(o, "severity") as Severity;
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`severity must be one of ${SEVERITIES.join("|")}`);
  }
  const confidence = Number(o.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be a number between 0 and 1");
  }
  const rawInterference = Array.isArray(o.interference) ? o.interference : [];
  const interference = rawInterference.filter((x): x is string =>
    typeof x === "string" && INTERFERENCE.includes(x)
  );
  return {
    construct_id: constructId(o, active),
    patient_quote: str(o, "patient_quote"),
    quote_gloss_en: str(o, "quote_gloss_en", false) || str(o, "patient_quote"),
    severity,
    confidence: Math.round(confidence * 100) / 100,
    interference,
    note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
  };
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  input: unknown,
): Promise<ToolExecResult> {
  try {
    switch (name) {
      case "record_evidence": {
        const ev = validateEvidence(input, ctx.activeConstructs);
        if (!ctx.messageId) {
          return { content: "No patient message yet; nothing to record.", is_error: true };
        }
        await ctx.db.insertEvidence({
          session_id: ctx.sessionId,
          message_id: ctx.messageId,
          superseded_by: null,
          ...ev,
          note: ev.note ?? null,
        });
        ctx.onEvidence({
          construct_id: ev.construct_id,
          severity: ev.severity,
          confidence: ev.confidence,
        });
        return { content: `Recorded ${ev.construct_id} as ${ev.severity} (${ev.confidence}).` };
      }
      case "record_probe_finding": {
        const o = obj(input);
        const category = str(o, "category") as FindingCategory;
        if (!CATEGORIES.includes(category)) {
          throw new Error(`category must be one of ${CATEGORIES.join("|")}`);
        }
        const id = constructId(o, ctx.activeConstructs);
        await ctx.db.insertFinding({
          session_id: ctx.sessionId,
          construct_id: id,
          category,
          finding: str(o, "finding"),
          message_id: ctx.messageId,
        });
        return { content: `Finding recorded for ${id} (${category}).` };
      }
      case "mark_declined": {
        const o = obj(input);
        const id = constructId(o, ctx.activeConstructs);
        if (!ctx.messageId) return { content: "No patient message yet.", is_error: true };
        await ctx.db.insertEvidence({
          session_id: ctx.sessionId,
          construct_id: id,
          message_id: ctx.messageId,
          patient_quote: str(o, "reason", false),
          quote_gloss_en: str(o, "reason", false),
          severity: "declined",
          confidence: 1,
          interference: [],
          note: "declined by patient",
          superseded_by: null,
        });
        return { content: `${id} marked declined. Do not return to it.` };
      }
      case "raise_safety_flag": {
        const o = obj(input);
        const trigger = str(o, "trigger");
        if (!TRIGGERS.includes(trigger)) {
          throw new Error(`trigger must be one of ${TRIGGERS.join("|")}`);
        }
        ctx.onSafetyFlag({
          trigger: trigger as RaiseSafetyFlagInput["trigger"],
          rationale: str(o, "rationale", false),
        });
        return {
          content:
            "Safety flag raised. Respond only with a brief, warm acknowledgement; the system takes over from here.",
        };
      }
      case "end_session": {
        const o = obj(input);
        const reason = str(o, "reason") as EndReason;
        if (!END_REASONS.includes(reason)) {
          throw new Error(`reason must be one of ${END_REASONS.join("|")}`);
        }
        ctx.onEndSession(reason);
        return { content: "Session will end after this message. Say a short goodbye." };
      }
      default:
        return { content: `Unknown tool ${name}`, is_error: true };
    }
  } catch (err) {
    console.error("tool failed", name, (err as Error).message);
    return { content: `Invalid input: ${(err as Error).message}`, is_error: true };
  }
}
