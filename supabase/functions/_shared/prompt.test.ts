import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildPatientSummaryPrompt,
  buildSystemPrompt,
  buildToolDefinitions,
  PRIORITY_GUIDANCE,
  renderPriorBrief,
  renderTurnBudget,
  type SystemPromptInput,
  WRAP_UP_100,
  WRAP_UP_80,
} from "./prompt.ts";
import { computeCoverage, selectActiveConstructs } from "./tracker.ts";
import { fixtureMap } from "./testing.ts";
import type { ProfileJson } from "./types.ts";

const map = fixtureMap({ population: "pediatric" });
const active = selectActiveConstructs(map, [], ["psych.self_consciousness"], "baseline");

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
    coverage: computeCoverage(map, active, [], []),
    budget: { turnsUsed: 3, maxTurns: 40, minutesElapsed: 2, targetMinutes: 12 },
    ...overrides,
  };
}

Deno.test("system prompt: sections appear in SPEC §7.2 order", () => {
  const p = buildSystemPrompt(input());
  const order = [
    "# Role",
    "# Register",
    "# Patient context",
    "# Clinician focus note",
    "# What matters to understand",
    "# Coverage status",
    "# Turn budget",
    "# Tools and how to use them",
    "# Control phrases",
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

Deno.test("tool definitions: the five SPEC §7.3 tools with required fields", () => {
  const tools = buildToolDefinitions();
  assertEquals(tools.map((t) => t.name), [
    "record_evidence",
    "record_probe_finding",
    "mark_declined",
    "raise_safety_flag",
    "end_session",
  ]);
  const ev = tools[0].input_schema;
  assertEquals(ev.required, [
    "construct_id",
    "patient_quote",
    "quote_gloss_en",
    "severity",
    "confidence",
    "interference",
  ]);
  assertEquals(tools[4].input_schema.required, ["reason"]);
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
