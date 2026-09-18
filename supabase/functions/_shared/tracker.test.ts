import { assert, assertEquals, assertFalse } from "@std/assert";
import type { ConstructEvidenceRow, ProbeFindingRow, Severity } from "./types.ts";
import {
  computeCoverage,
  isCoverageComplete,
  prioritisedOpen,
  selectActiveConstructs,
} from "./tracker.ts";
import { fixtureMap } from "./testing.ts";

let n = 0;
function ev(
  construct_id: string,
  severity: Severity,
  confidence = 0.9,
  superseded_by: string | null = null,
): ConstructEvidenceRow {
  n++;
  return {
    id: `ev-${n}`,
    session_id: "s",
    construct_id,
    message_id: "m",
    patient_quote: "q",
    quote_gloss_en: "q",
    severity,
    confidence,
    interference: [],
    note: null,
    superseded_by,
    created_at: new Date(1000 * n).toISOString(),
  };
}
function finding(construct_id: string): ProbeFindingRow {
  n++;
  return {
    id: `f-${n}`,
    session_id: "s",
    construct_id,
    finding: "x",
    category: "impact",
    message_id: null,
    created_at: "",
  };
}

const map = fixtureMap();

Deno.test("selectActiveConstructs: diagnosis focus narrows the map; clinician focus is added and flagged first", () => {
  const active = selectActiveConstructs(map, ["appearance.nose"], ["psych.mood"], "baseline");
  assertEquals(active.map((c) => c.id), ["psych.mood", "appearance.nose"]);
  assert(active[0].focus);
  assertFalse(active[1].focus);
  // No diagnosis focus → whole map, in map order, no focus flags.
  const whole = selectActiveConstructs(map, [], [], "baseline");
  assertEquals(whole.map((c) => c.id), [
    "appearance.overall",
    "appearance.nose",
    "psych.self_consciousness",
    "psych.mood",
  ]);
});

Deno.test("selectActiveConstructs: timepoint-gated constructs only appear at matching timepoints", () => {
  assertFalse(
    selectActiveConstructs(map, [], [], "baseline").some((c) => c.id === "outcome.decision"),
  );
  assert(
    selectActiveConstructs(map, [], [], "post-op-6w").some((c) => c.id === "outcome.decision"),
  );
});

Deno.test("selectActiveConstructs: cap keeps clinician focus, then core, then the rest", () => {
  const active = selectActiveConstructs(map, [], [], "baseline", 2);
  assertEquals(active.map((c) => c.id).sort(), ["appearance.overall", "psych.self_consciousness"]);
  const withFocus = selectActiveConstructs(map, [], ["psych.mood"], "baseline", 2);
  assertEquals(withFocus.map((c) => c.id), ["psych.mood", "appearance.overall"]);
  // Diagnosis focus larger than the cap: clinician focus survives, then core from the focus set.
  const big = selectActiveConstructs(
    map,
    ["appearance.overall", "appearance.nose", "psych.self_consciousness"],
    ["psych.mood"],
    "baseline",
    3,
  );
  assertEquals(big.map((c) => c.id), [
    "psych.mood",
    "appearance.overall",
    "psych.self_consciousness",
  ]);
});

Deno.test("selectActiveConstructs: ignores unknown focus ids", () => {
  const active = selectActiveConstructs(map, ["nope"], ["also.nope"], "baseline");
  assertEquals(active.length, 4);
});

Deno.test("computeCoverage: untouched / partial / covered / declined / needs_clarification / drill_down", () => {
  const active = selectActiveConstructs(map, [], [], "baseline");
  const state = computeCoverage(map, active, [
    ev("appearance.nose", "mild", 0.8), // covered
    ev("psych.self_consciousness", "severe", 0.9), // drill_down_pending (no findings)
    ev("psych.mood", "declined", 1), // declined
    ev("appearance.overall", "moderate", 0.3), // needs_clarification (low confidence)
  ], []);
  const by = Object.fromEntries(state.constructs.map((c) => [c.construct_id, c]));
  assertEquals(by["appearance.nose"].status, "covered");
  assertEquals(by["appearance.nose"].severity, "mild");
  assertEquals(by["psych.self_consciousness"].status, "drill_down_pending");
  assertEquals(by["psych.mood"].status, "declined");
  assertEquals(by["appearance.overall"].status, "needs_clarification");
  assertEquals(state.covered, 2);
  assertEquals(state.total_active, 4);
  assertFalse(state.complete);
});

Deno.test("computeCoverage: drill_down_done needs ≥2 findings; conflicting severities → needs_clarification", () => {
  const active = selectActiveConstructs(map, [], [], "baseline");
  const done = computeCoverage(map, active, [ev("appearance.nose", "moderate")], [
    finding("appearance.nose"),
    finding("appearance.nose"),
  ]);
  assertEquals(
    done.constructs.find((c) => c.construct_id === "appearance.nose")!.status,
    "drill_down_done",
  );
  const one = computeCoverage(map, active, [ev("appearance.nose", "moderate")], [
    finding("appearance.nose"),
  ]);
  assertEquals(
    one.constructs.find((c) => c.construct_id === "appearance.nose")!.status,
    "drill_down_pending",
  );

  const conflict = computeCoverage(map, active, [
    ev("appearance.nose", "none"),
    ev("appearance.nose", "severe"),
  ], []);
  assertEquals(
    conflict.constructs.find((c) => c.construct_id === "appearance.nose")!.status,
    "needs_clarification",
  );
  const adjacent = computeCoverage(map, active, [
    ev("appearance.nose", "mild"),
    ev("appearance.nose", "moderate"),
  ], []);
  assertEquals(
    adjacent.constructs.find((c) => c.construct_id === "appearance.nose")!.status,
    "drill_down_pending",
  );
});

Deno.test("computeCoverage: superseded rows are ignored; unclear-only is partial; findings-only is partial", () => {
  const active = selectActiveConstructs(map, [], [], "baseline");
  const state = computeCoverage(map, active, [
    ev("appearance.nose", "severe", 0.9, "ev-later"),
    ev("appearance.nose", "none", 0.9),
    ev("appearance.overall", "unclear", 0.9),
  ], [finding("psych.mood")]);
  const by = Object.fromEntries(state.constructs.map((c) => [c.construct_id, c]));
  assertEquals(by["appearance.nose"].status, "covered");
  assertEquals(by["appearance.nose"].severity, "none");
  assertEquals(by["appearance.overall"].status, "partial");
  assertEquals(by["psych.mood"].status, "partial");
  assertEquals(by["psych.self_consciousness"].status, "untouched");
});

Deno.test("isCoverageComplete: terminal statuses complete; needs_clarification on a core construct blocks", () => {
  const active = selectActiveConstructs(map, [], [], "baseline");
  const complete = computeCoverage(map, active, [
    ev("appearance.overall", "none"),
    ev("appearance.nose", "mild"),
    ev("psych.self_consciousness", "declined"),
    ev("psych.mood", "moderate"),
  ], [finding("psych.mood"), finding("psych.mood")]);
  assert(complete.complete);
  const blocked = computeCoverage(map, active, [
    ev("appearance.overall", "none", 0.2),
    ev("appearance.nose", "mild"),
    ev("psych.self_consciousness", "declined"),
    ev("psych.mood", "none"),
  ], []);
  assertFalse(blocked.complete);
  assert(isCoverageComplete(blocked, false));
});

Deno.test("prioritisedOpen: FOCUS → needs_clarification → drill_down_pending → untouched core → standard → optional", () => {
  const active = selectActiveConstructs(map, [], ["psych.mood"], "baseline");
  const state = computeCoverage(map, active, [
    ev("appearance.nose", "severe"), // drill_down_pending
    ev("psych.self_consciousness", "mild", 0.1), // needs_clarification
  ], []);
  assertEquals(prioritisedOpen(state).map((c) => c.construct_id), [
    "psych.mood",
    "psych.self_consciousness",
    "appearance.nose",
    "appearance.overall",
  ]);
});
