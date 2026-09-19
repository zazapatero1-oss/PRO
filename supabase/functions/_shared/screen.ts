// Numeric screen (v1.2): ~20 rated items answered before the conversation. Each score becomes an
// evidence row on its construct, and the lowest scores become the conversation's focus list.

import type {
  ActiveConstruct,
  ConstructEvidenceInsert,
  Language,
  ScreenItemRow,
  Severity,
} from "./types.ts";
import { MAX_FOCUS_CONSTRUCTS } from "./tracker.ts";

export const SCREEN_MIN = 0;
export const SCREEN_MAX = 10;
/** Scores at or below this are "a problem" and qualify for focus. */
export const SCREEN_FOCUS_THRESHOLD = 6;
/** Always talk about at least this many areas, even when every score is high. */
export const SCREEN_MIN_FOCUS = 3;

export function severityForScore(score: number): Severity {
  if (score <= 3) return "severe";
  if (score <= 5) return "moderate";
  if (score <= 7) return "mild";
  return "none";
}

export function validateScores(
  raw: Record<string, unknown> | undefined,
  items: ScreenItemRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const v = raw?.[item.id];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < SCREEN_MIN || n > SCREEN_MAX) {
      throw new Error(
        `Missing or invalid score for ${item.id} (integer ${SCREEN_MIN}–${SCREEN_MAX})`,
      );
    }
    out[item.id] = n;
  }
  return out;
}

export function itemText(item: ScreenItemRow, language: Language): string {
  return language === "es" ? item.text_es : item.text_en;
}

/** One evidence row per item. The "quote" is the rating itself, which is the patient's own input. */
export function evidenceForScreen(
  sessionId: string,
  items: ScreenItemRow[],
  scores: Record<string, number>,
  language: Language,
): ConstructEvidenceInsert[] {
  return items.map((item) => {
    const score = scores[item.id];
    return {
      session_id: sessionId,
      message_id: null,
      construct_id: item.construct_id,
      patient_quote: `${score}/10 — ${itemText(item, language)}`,
      quote_gloss_en: `${score}/10 — ${item.text_en}`,
      severity: severityForScore(score),
      confidence: 0.9,
      interference: [],
      note: "numeric screen",
      superseded_by: null,
      facets: [],
      triage_item: `screen:${item.id}`,
    };
  });
}

/**
 * Focus = the lowest-scoring areas: everything at or below the threshold, always at least three,
 * capped at eight; clinician focus constructs come first regardless of score.
 */
export function focusFromScreen(
  items: ScreenItemRow[],
  scores: Record<string, number>,
  active: ActiveConstruct[],
  max = MAX_FOCUS_CONSTRUCTS,
  /** Every construct id in the map; screened constructs outside the diagnosis set still count. */
  mapIds: ReadonlySet<string> | null = null,
): string[] {
  const allowed = mapIds ?? new Set(active.map((c) => c.id));
  const clinician = active.filter((c) => c.focus).map((c) => c.id);
  const byConstruct = new Map<string, number>();
  for (const item of items) {
    if (!allowed.has(item.construct_id)) continue;
    const s = scores[item.id];
    const prev = byConstruct.get(item.construct_id);
    if (prev === undefined || s < prev) byConstruct.set(item.construct_id, s);
  }
  const ranked = [...byConstruct.entries()]
    .filter(([id]) => !clinician.includes(id))
    .sort((a, b) => a[1] - b[1]);
  const low = ranked.filter(([, s]) => s <= SCREEN_FOCUS_THRESHOLD).map(([id]) => id);
  const picked = low.length >= SCREEN_MIN_FOCUS
    ? low
    : ranked.slice(0, SCREEN_MIN_FOCUS).map(([id]) => id);
  return [...clinician, ...picked].slice(0, max);
}

/** Lines for the system prompt: what was rated, lowest first, with the score. */
export function renderScreenForPrompt(
  items: ScreenItemRow[],
  scores: Record<string, number>,
  language: Language,
): string {
  const rows = items
    .map((i) => ({ i, s: scores[i.id] }))
    .filter((r) => Number.isFinite(r.s))
    .sort((a, b) => a.s - b.s)
    .map((r) => `- ${r.i.construct_id}: ${r.s}/10 — ${itemText(r.i, language)}`);
  return [
    "## Numeric screen (0 = worst, 10 = best), lowest first",
    ...rows,
    "Use these to know where to start and how serious each area is. Start with the lowest. " +
    "Do not read numbers back to the patient; talk about what they rated low in plain words.",
  ].join("\n");
}
