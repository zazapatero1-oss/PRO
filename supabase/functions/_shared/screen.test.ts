import { assertEquals, assertThrows } from "@std/assert";
import {
  evidenceForScreen,
  focusFromScreen,
  renderScreenForPrompt,
  severityForScore,
  validateScores,
} from "./screen.ts";
import type { ActiveConstruct, ScreenItemRow } from "./types.ts";

const item = (id: string, construct_id: string, sort_order: number): ScreenItemRow => ({
  id,
  population: "adult",
  construct_id,
  domain: "facial",
  text_en: `How is ${id}?`,
  text_es: `¿Cómo está ${id}?`,
  low_en: "Bad",
  high_en: "Good",
  low_es: "Mal",
  high_es: "Bien",
  sort_order,
  active: true,
});
const items = [
  item("a", "appearance.overall", 1),
  item("b", "appearance.nose", 2),
  item("c", "appearance.eyes", 3),
  item("d", "psych.mood", 4),
  item("e", "function.breathing", 5),
];
const active = items.map((i, n) => ({ id: i.construct_id, focus: n === 3 } as ActiveConstruct));

Deno.test("severityForScore bands", () => {
  assertEquals([0, 3, 4, 5, 6, 7, 8, 10].map(severityForScore), [
    "severe",
    "severe",
    "moderate",
    "moderate",
    "mild",
    "mild",
    "none",
    "none",
  ]);
});

Deno.test("validateScores requires every item as an integer 0–10", () => {
  assertEquals(validateScores({ a: 3, b: "7", c: 10, d: 0, e: 5 }, items), {
    a: 3,
    b: 7,
    c: 10,
    d: 0,
    e: 5,
  });
  assertThrows(() => validateScores({ a: 3, b: 7, c: 10, d: 0 }, items));
  assertThrows(() => validateScores({ a: 11, b: 7, c: 10, d: 0, e: 5 }, items));
  assertThrows(() => validateScores({ a: 2.5, b: 7, c: 10, d: 0, e: 5 }, items));
});

Deno.test("focusFromScreen: lowest first, threshold, minimum three, clinician focus first", () => {
  // d is clinician focus (score 9) and still comes first; then the ≤6 scores ascending.
  assertEquals(
    focusFromScreen(items, { a: 8, b: 2, c: 6, d: 9, e: 4 }, active),
    ["psych.mood", "appearance.nose", "function.breathing", "appearance.eyes"],
  );
  // All high: still the three lowest.
  assertEquals(
    focusFromScreen(items, { a: 9, b: 8, c: 10, d: 9, e: 7 }, active),
    ["psych.mood", "function.breathing", "appearance.nose", "appearance.overall"],
  );
});

Deno.test("evidenceForScreen tags rows so triage counts as answered", () => {
  const rows = evidenceForScreen("s1", items, { a: 3, b: 7, c: 10, d: 0, e: 5 }, "es");
  assertEquals(rows.length, 5);
  assertEquals(rows[0].triage_item, "screen:a");
  assertEquals(rows[0].severity, "severe");
  assertEquals(rows[0].patient_quote, "3/10 — ¿Cómo está a?");
  assertEquals(rows[0].quote_gloss_en, "3/10 — How is a?");
});

Deno.test("renderScreenForPrompt lists lowest first", () => {
  const text = renderScreenForPrompt(items, { a: 8, b: 2, c: 6, d: 9, e: 4 }, "en");
  const order = text.split("\n").filter((l) => l.startsWith("- ")).map((l) =>
    l.split(":")[0].slice(2)
  );
  assertEquals(order, [
    "appearance.nose",
    "function.breathing",
    "appearance.eyes",
    "appearance.overall",
    "psych.mood",
  ]);
});
