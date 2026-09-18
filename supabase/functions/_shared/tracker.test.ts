import { assert, assertEquals, assertFalse } from "@std/assert";
import type { ConstructEvidenceRow, ConstructMap, ProbeFindingRow, Severity } from "./types.ts";
import {
  computeCoverage,
  computeTrackerState,
  confirmationText,
  deriveFocus,
  focusState,
  isConfirmation,
  isConstructCoverageComplete,
  MAX_FOCUS_CONSTRUCTS,
  MAX_TRIAGE_TURNS,
  prioritisedOpen,
  selectActiveConstructs,
  triageState,
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
    facets: [],
    triage_item: null,
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

Deno.test("isConstructCoverageComplete: terminal statuses complete; needs_clarification on a core construct blocks", () => {
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
  assert(isConstructCoverageComplete(blocked, false));
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

// ---------------------------------------------------------------------------
// v1.1 §B: triage, focus, facets, confirmation, end decision
// ---------------------------------------------------------------------------

function evf(
  construct_id: string,
  severity: Severity,
  extra: Partial<ConstructEvidenceRow> = {},
): ConstructEvidenceRow {
  return { ...ev(construct_id, severity), ...extra };
}

function confirmFinding(construct_id: string): ProbeFindingRow {
  return { ...finding(construct_id), category: "other", finding: confirmationText("your eyes") };
}

const baseSession = {
  timepoint: "baseline" as const,
  phase: "triage" as const,
  focus_constructs: [] as string[],
};
const allActive = selectActiveConstructs(map, [], [], "baseline");

Deno.test("triageState: items are answered by evidence rows carrying their id, in order", () => {
  const empty = triageState(map, baseSession, []);
  assertEquals(empty.items.map((i) => i.id), ["overall", "features", "impact"]);
  assertEquals(empty.next?.id, "overall");
  assertFalse(empty.done);

  const partial = triageState(map, baseSession, [
    evf("appearance.overall", "mild", { triage_item: "overall" }),
    evf("psych.mood", "mild", { triage_item: "impact" }),
  ]);
  assertEquals(partial.answered, ["overall", "impact"]);
  assertEquals(partial.next?.id, "features");

  const done = triageState(map, baseSession, [
    evf("appearance.overall", "mild", { triage_item: "overall" }),
    evf("appearance.nose", "mild", { triage_item: "features" }),
    evf("psych.mood", "mild", { triage_item: "impact" }),
  ]);
  assert(done.done);
  assertEquals(done.next, null);
});

Deno.test("triageState: timepoint-gated items only apply after surgery", () => {
  assertFalse(triageState(map, baseSession, []).items.some((i) => i.id === "recovery"));
  const postOp = triageState(map, { timepoint: "post-op-6w" }, []);
  assertEquals(postOp.items.map((i) => i.id), ["overall", "features", "impact", "recovery"]);
});

Deno.test("deriveFocus: mild+ evidence, triage mentions and clinician focus; declines excluded", () => {
  const active = selectActiveConstructs(map, [], ["psych.mood"], "baseline");
  const focus = deriveFocus(active, [
    evf("appearance.overall", "severe"),
    evf("appearance.nose", "none"), // "fine" → not a focus
    evf("psych.self_consciousness", "unclear", { triage_item: "impact" }), // named in triage
  ]);
  // clinician focus first, then severity desc, then core before standard.
  assertEquals(focus, ["psych.mood", "appearance.overall", "psych.self_consciousness"]);

  const declined = deriveFocus(active, [
    evf("appearance.overall", "severe"),
    evf("appearance.overall", "declined"),
  ]);
  assertEquals(declined, ["psych.mood"]);
});

Deno.test("deriveFocus: caps the list at eight", () => {
  const many: ConstructMap = fixtureMap({
    domains: [{
      id: "d",
      label: "D",
      weight: 1,
      constructs: Array.from({ length: 12 }, (_, i) => ({
        id: `d.c${i}`,
        label: `C${i}`,
        description: "",
        severity_signals: { none: "", mild: "", moderate: "", severe: "" },
        drill_down: [],
        priority: "standard" as const,
      })),
    }],
  });
  const active = selectActiveConstructs(many, [], [], "baseline", 12);
  const focus = deriveFocus(active, active.map((c) => evf(c.id, "moderate")));
  assertEquals(focus.length, MAX_FOCUS_CONSTRUCTS);
  assertEquals(focus[0], "d.c0");
});

Deno.test("focusState: facet threshold, confirmation marker and declines", () => {
  const construct = allActive.find((c) => c.id === "appearance.overall")!;
  const untouched = focusState(map, construct, [], []);
  assertEquals(untouched.status, "untouched");
  assertEquals(untouched.facets_total, 3);
  assertEquals(untouched.facets_missing, ["mirror", "photos", "wanted_change"]);
  assertFalse(untouched.ready_to_confirm);

  // 2 of 3 facets = 0.67 < 0.7 → not ready; 3 of 3 → ready.
  const two = focusState(map, construct, [
    evf("appearance.overall", "moderate", { facets: ["mirror", "photos", "not_a_facet"] }),
  ], []);
  assertEquals(two.status, "in_progress");
  assertEquals(two.facets_covered, ["mirror", "photos"]);
  assertFalse(two.ready_to_confirm);

  const three = focusState(map, construct, [
    evf("appearance.overall", "moderate", { facets: ["mirror", "photos"] }),
    evf("appearance.overall", "moderate", { facets: ["wanted_change"] }),
  ], []);
  assert(three.ready_to_confirm);
  assertEquals(three.facets_missing, []);

  const confirmed = focusState(map, construct, [evf("appearance.overall", "moderate")], [
    confirmFinding("appearance.overall"),
  ]);
  assertEquals(confirmed.status, "confirmed");

  const declined = focusState(map, construct, [evf("appearance.overall", "declined")], [
    confirmFinding("appearance.overall"),
  ]);
  assertEquals(declined.status, "declined");
});

Deno.test("computeTrackerState: triage → explore on the last answer, then focus is stable", () => {
  const evidence = [
    evf("appearance.overall", "moderate", { triage_item: "overall" }),
    evf("appearance.nose", "mild", { triage_item: "features" }),
  ];
  const stillTriage = computeTrackerState({
    map,
    session: baseSession,
    active: allActive,
    evidence,
    findings: [],
    assistantTurns: 2,
  });
  assertEquals(stillTriage.phase, "triage");
  assertEquals(stillTriage.current_focus, null);
  assertEquals(stillTriage.focus_constructs, []);

  const answered = [...evidence, evf("psych.mood", "mild", { triage_item: "impact" })];
  const explore = computeTrackerState({
    map,
    session: baseSession,
    active: allActive,
    evidence: answered,
    findings: [],
    assistantTurns: 3,
  });
  assertEquals(explore.phase, "explore");
  assertEquals(explore.focus_constructs, [
    "appearance.overall",
    "appearance.nose",
    "psych.mood",
  ]);
  assertEquals(explore.current_focus?.construct_id, "appearance.overall");
  assertEquals(explore.focus_progress, { confirmed: 0, total: 3 });

  // A session that already has a focus list keeps it, even as new evidence arrives.
  const kept = computeTrackerState({
    map,
    session: { ...baseSession, phase: "explore", focus_constructs: ["psych.mood"] },
    active: allActive,
    evidence: [...answered, evf("psych.self_consciousness", "severe")],
    findings: [],
    assistantTurns: 5,
  });
  assertEquals(kept.focus_constructs, ["psych.mood"]);
});

Deno.test("computeTrackerState: triage gives up after six assistant turns", () => {
  const state = computeTrackerState({
    map,
    session: baseSession,
    active: allActive,
    evidence: [evf("appearance.overall", "moderate", { triage_item: "overall" })],
    findings: [],
    assistantTurns: MAX_TRIAGE_TURNS,
  });
  assertEquals(state.phase, "explore");
  assertEquals(state.focus_constructs, ["appearance.overall"]);
});

Deno.test("computeTrackerState: confirm advances the focus; declines skip it", () => {
  const evidence = [
    evf("appearance.overall", "moderate", { triage_item: "overall" }),
    evf("appearance.nose", "mild", { triage_item: "features" }),
    evf("psych.mood", "mild", { triage_item: "impact" }),
  ];
  const session = {
    ...baseSession,
    phase: "explore" as const,
    focus_constructs: ["appearance.overall", "appearance.nose", "psych.mood"],
  };
  const confirmedFirst = computeTrackerState({
    map,
    session,
    active: allActive,
    evidence,
    findings: [confirmFinding("appearance.overall")],
    assistantTurns: 6,
  });
  assertEquals(confirmedFirst.current_focus?.construct_id, "appearance.nose");
  assertEquals(confirmedFirst.focus_progress, { confirmed: 1, total: 3 });

  const declinedSecond = computeTrackerState({
    map,
    session,
    active: allActive,
    evidence: [...evidence, evf("appearance.nose", "declined")],
    findings: [confirmFinding("appearance.overall")],
    assistantTurns: 7,
  });
  assertEquals(declinedSecond.current_focus?.construct_id, "psych.mood");
  assertEquals(declinedSecond.focus_progress, { confirmed: 2, total: 3 });
});

Deno.test("isCoverageComplete / end decision: all focus closed + triage done, or budget", () => {
  const evidence = [
    evf("appearance.overall", "moderate", { triage_item: "overall" }),
    evf("appearance.nose", "mild", { triage_item: "features" }),
    evf("psych.mood", "mild", { triage_item: "impact" }),
  ];
  const session = {
    ...baseSession,
    phase: "explore" as const,
    focus_constructs: ["appearance.overall", "appearance.nose", "psych.mood"],
  };
  const open = computeTrackerState({
    map,
    session,
    active: allActive,
    evidence,
    findings: [confirmFinding("appearance.overall")],
    assistantTurns: 8,
  });
  assertFalse(open.complete);
  assertEquals(open.end_reason, null);
  assertEquals(open.phase, "explore");

  const closed = computeTrackerState({
    map,
    session,
    active: allActive,
    evidence: [...evidence, evf("psych.mood", "declined")],
    findings: [confirmFinding("appearance.overall"), confirmFinding("appearance.nose")],
    assistantTurns: 9,
  });
  assert(closed.complete);
  assertEquals(closed.end_reason, "coverage_complete");
  assertEquals(closed.phase, "wrap-up");
  // Light (non-focus) constructs never block: psych.self_consciousness was never touched.
  assert(allActive.some((c) => c.id === "psych.self_consciousness"));

  const outOfBudget = computeTrackerState({
    map,
    session,
    active: allActive,
    evidence,
    findings: [],
    assistantTurns: 60,
    budgetFraction: 1,
  });
  assertEquals(outOfBudget.end_reason, "turn_budget");
  assertEquals(outOfBudget.phase, "wrap-up");

  // An empty conversation never ends by itself, even with an empty focus list.
  const nothingSaid = computeTrackerState({
    map,
    session: { ...baseSession, phase: "explore" },
    active: allActive,
    evidence: [],
    findings: [],
    assistantTurns: 1,
  });
  assertFalse(nothingSaid.complete);
  assertEquals(nothingSaid.end_reason, null);
});

Deno.test("isConfirmation: only an `other` finding starting with the marker counts", () => {
  assert(isConfirmation({ category: "other", finding: confirmationText("your nose bothers you") }));
  assertFalse(isConfirmation({ category: "impact", finding: "confirmed: x" }));
  assertFalse(isConfirmation({ category: "other", finding: "they mentioned photos" }));
});
