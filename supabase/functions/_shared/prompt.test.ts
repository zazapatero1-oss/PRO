import { assert, assertStringIncludes } from "@std/assert";
import {
  buildExtractionPrompt,
  buildIngestMergePrompt,
  buildPatientSummaryPrompt,
  buildSystemPrompt,
  EXPLORE_GUIDANCE,
  PRIORITY_GUIDANCE,
  renderPriorBrief,
  renderTurnBudget,
  type SystemPromptInput,
  TRIAGE_GUIDANCE_SUFFIX,
  WRAP_UP_100,
  WRAP_UP_80,
} from "./prompt.ts";
import { computeTrackerState, selectActiveConstructs } from "./tracker.ts";
import { fixtureMap } from "./testing.ts";
import type {
  ConstructEvidenceRow,
  ProbeFindingRow,
  ProfileJson,
  SessionRow,
  Severity,
  TrackerState,
} from "./types.ts";

const map = fixtureMap({ population: "pediatric" });
const active = selectActiveConstructs(map, [], ["psych.self_consciousness"], "baseline");

let n = 0;
function ev(
  construct_id: string,
  severity: Severity,
  extra: Partial<ConstructEvidenceRow> = {},
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
    confidence: 0.9,
    interference: [],
    facets: [],
    triage_item: null,
    note: null,
    superseded_by: null,
    created_at: new Date(1000 * n).toISOString(),
    ...extra,
  };
}

function tracker(
  opts: {
    evidence?: ConstructEvidenceRow[];
    findings?: ProbeFindingRow[];
    phase?: SessionRow["phase"];
    focus?: string[];
    turns?: number;
    fraction?: number;
  } = {},
): TrackerState {
  return computeTrackerState({
    map,
    session: {
      timepoint: "baseline",
      phase: opts.phase ?? "triage",
      focus_constructs: opts.focus ?? [],
    },
    active,
    evidence: opts.evidence ?? [],
    findings: opts.findings ?? [],
    assistantTurns: opts.turns ?? 1,
    budgetFraction: opts.fraction ?? 0,
  });
}

function input(overrides: Partial<SystemPromptInput> = {}): SystemPromptInput {
  return {
    language: "es",
    ageBand: "8-12",
    readingComfort: "short-messages",
    respondent: "guardian",
    displayName: "Lu",
    diagnosisLabel: "Labio y paladar hendido",
    timepoint: "baseline",
    priorBrief: null,
    clinicianNote: {
      note: "Ask about school photos.",
      focus_constructs: ["psych.self_consciousness"],
    },
    population: "pediatric",
    activeConstructs: active,
    tracker: tracker(),
    budget: { turnsUsed: 3, maxTurns: 40, minutesElapsed: 2, targetMinutes: 12 },
    ...overrides,
  };
}

Deno.test("system prompt: stable sections first, per-turn sections last (SPEC §7.2, cache-friendly)", () => {
  const p = buildSystemPrompt(input());
  const order = [
    "# Role",
    "# Register",
    "# Patient context",
    "# Clinician focus note",
    "# What matters to understand",
    "# How to talk",
    "# Control phrases",
    "# This phase",
    "# Coverage status",
    "# Turn budget",
  ];
  let last = -1;
  for (const h of order) {
    const i = p.indexOf(h);
    assert(i > last, `${h} out of order or missing`);
    last = i;
  }
});

Deno.test("system prompt: child + guardian + Spanish register text", () => {
  const p = buildSystemPrompt(input());
  assertStringIncludes(p, "Conduct the whole conversation in Spanish");
  assertStringIncludes(p, "The patient is a child (8–12)");
  assertStringIncludes(p, "prefer short messages");
  assertStringIncludes(p, "parent or guardian of the patient, Lu");
  assertStringIncludes(p, "Adapt dynamically");
  assertStringIncludes(p, "Never use medical jargon");
  assertStringIncludes(p, "Labio y paladar hendido");
});

Deno.test("system prompt: pediatric age variant is applied and focus is marked", () => {
  const p = buildSystemPrompt(input());
  assertStringIncludes(p, "How the child feels about their face at school and with friends.");
  assertStringIncludes(p, "Teasing; Avoiding activities");
  assertStringIncludes(p, "psych.self_consciousness [FOCUS]");
  assertStringIncludes(p, "Ask about school photos.");
  assertStringIncludes(p, PRIORITY_GUIDANCE);
});

Deno.test("system prompt: every register combination renders without throwing", () => {
  for (
    const ageBand of ["under-8", "8-12", "13-17", "18-29", "30-49", "50-69", "70-plus"] as const
  ) {
    for (const readingComfort of ["short-messages", "comfortable", "prefer-voice"] as const) {
      for (const respondent of ["self", "guardian", "both"] as const) {
        for (const language of ["en", "es"] as const) {
          const p = buildSystemPrompt(input({ ageBand, readingComfort, respondent, language }));
          assert(p.length > 1000);
        }
      }
    }
  }
});

Deno.test("turn budget: 80% and 100% rules on turns or minutes", () => {
  const none = renderTurnBudget({
    turnsUsed: 10,
    maxTurns: 40,
    minutesElapsed: 3,
    targetMinutes: 12,
  });
  assert(!none.includes(WRAP_UP_80) && !none.includes(WRAP_UP_100));
  const eighty = renderTurnBudget({
    turnsUsed: 32,
    maxTurns: 40,
    minutesElapsed: 3,
    targetMinutes: 12,
  });
  assertStringIncludes(eighty, WRAP_UP_80);
  const byMinutes = renderTurnBudget({
    turnsUsed: 5,
    maxTurns: 40,
    minutesElapsed: 10,
    targetMinutes: 12,
  });
  assertStringIncludes(byMinutes, WRAP_UP_80);
  const full = renderTurnBudget({
    turnsUsed: 40,
    maxTurns: 40,
    minutesElapsed: 3,
    targetMinutes: 12,
  });
  assertStringIncludes(full, WRAP_UP_100);
  assert(!full.includes(WRAP_UP_80));
});

Deno.test("prior brief is ≤200 words and included for non-baseline sessions", () => {
  const profile: ProfileJson = {
    generated_with: { model: "m", prompt_version: "v", map: "x@1" },
    domains: Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`,
      label: `Domain ${i}`,
      severity: "moderate",
      confidence: 0.7,
      summary_en:
        "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua "
          .repeat(3),
      constructs: [{
        id: `c${i}`,
        label: "c",
        severity: "moderate",
        confidence: 0.7,
        quotes: [{ text: "hola", lang: "es", gloss_en: "hello" }],
        findings: [],
        status: "covered",
        facets_covered: [],
        facets_missing: [],
        confirmed: false,
      }],
    })),
    needs_clarification: [],
    not_covered: [],
    declined: ["c9"],
    patient_questions: [],
    change_from_prior: [],
    disclaimer: "d",
  };
  const brief = renderPriorBrief(profile, "baseline");
  assert(brief.split(/\s+/).length <= 201);
  const p = buildSystemPrompt(input({ timepoint: "post-op-6w", priorBrief: brief }));
  assertStringIncludes(p, "## Prior-session brief");
  assertStringIncludes(p, "Reference change naturally");
});

Deno.test("no tool instructions survive in the conversational prompt (v1.1 §C)", () => {
  const p = buildSystemPrompt(input());
  for (
    const forbidden of [
      "record_evidence",
      "record_probe_finding",
      "mark_declined",
      "raise_safety_flag",
      "end_session",
      "tool",
    ]
  ) {
    assert(!p.toLowerCase().includes(forbidden), `prompt still mentions "${forbidden}"`);
  }
});

Deno.test("phase guidance: triage names the next unanswered item and forbids exploring", () => {
  const p = buildSystemPrompt(input());
  assertStringIncludes(p, "# This phase");
  assertStringIncludes(
    p,
    `Ask about: How they feel overall about how their face looks right now ${TRIAGE_GUIDANCE_SUFFIX}`,
  );
  // Second item once the first is answered.
  const answered = tracker({
    evidence: [ev("appearance.overall", "mild", { triage_item: "overall" })],
  });
  const next = buildSystemPrompt(input({ tracker: answered }));
  assertStringIncludes(next, "Which parts of their face are on their mind most");
});

Deno.test("phase guidance: explore names the focus, the missing facet labels and the confirm step", () => {
  const evidence = [
    ev("psych.self_consciousness", "moderate", {
      triage_item: "impact",
      facets: ["situations"],
    }),
  ];
  const p = buildSystemPrompt(
    input({ tracker: tracker({ evidence, phase: "explore", turns: 6 }) }),
  );
  assertStringIncludes(p, "Current focus: Self-consciousness about appearance.");
  assertStringIncludes(p, "Still to cover: Things they avoid because of it.");
  assertStringIncludes(p, EXPLORE_GUIDANCE);
});

Deno.test("phase guidance: wrap-up closes and opens nothing new", () => {
  const p = buildSystemPrompt(
    input({
      tracker: tracker({
        evidence: [ev("appearance.overall", "none", { triage_item: "overall" })],
        phase: "explore",
        fraction: 1,
      }),
      budget: { turnsUsed: 60, maxTurns: 60, minutesElapsed: 1, targetMinutes: 20 },
    }),
  );
  assertStringIncludes(p, "You are closing the conversation.");
  assertStringIncludes(p, WRAP_UP_100);
});

Deno.test("extraction prompt: verbatim-quote rule, ids, facets, triage items", () => {
  const { system, user } = buildExtractionPrompt({
    lastAssistantMessage: "What bothers you most about your nose?",
    patientMessage: "the shape, mostly in photos",
    activeConstructs: active,
    population: "adult",
    triage: map.triage ?? [],
    language: "en",
  });
  assertStringIncludes(system, "MUST be a verbatim substring of the patient message");
  assertStringIncludes(system, '"triage_item"');
  assertStringIncludes(system, "confirmed");
  assertStringIncludes(user, "What bothers you most about your nose?");
  assertStringIncludes(user, "the shape, mostly in photos");
  assertStringIncludes(user, "psych.self_consciousness");
  assertStringIncludes(user, "situations=Situations where it is worse");
  assertStringIncludes(user, "- overall: How they feel overall");
});

Deno.test("ingest merge prompt: additions only, no copied wording, current map included", () => {
  const { system, user } = buildIngestMergePrompt({
    instrumentSlug: "face-q-aesthetics",
    population: "adult",
    currentMap: map,
    text: "Some pasted questionnaire text.",
  });
  assertStringIncludes(system, "Propose ADDITIONS ONLY");
  assertStringIncludes(system, "never copy, quote, lightly reword");
  assertStringIncludes(user, "appearance.overall");
  assertStringIncludes(user, "facets: mirror, photos, wanted_change");
  assertStringIncludes(user, "Some pasted questionnaire text.");
});

Deno.test("patient summary prompt: Spanish closing line and no severity labels instruction", () => {
  const { system } = buildPatientSummaryPrompt({
    language: "es",
    ageBand: "30-49",
    readingComfort: "comfortable",
    respondent: "self",
    displayName: "Sam",
    profile: {
      generated_with: { model: "", prompt_version: "", map: "" },
      domains: [],
      needs_clarification: [],
      not_covered: [],
      declined: [],
      patient_questions: [],
      change_from_prior: [],
      disclaimer: "",
    },
  });
  assertStringIncludes(system, "¿Lo entendí bien? Puede corregir cualquier cosa.");
  assertStringIncludes(system, "no severity labels");
  assertStringIncludes(system, "at most 150 words");
});
