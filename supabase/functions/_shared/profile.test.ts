import { assertEquals } from "@std/assert";
import {
  buildDeterministicProfile,
  computeChange,
  domainSeverity,
  generateProfile,
} from "./profile.ts";
import { computeCoverage, selectActiveConstructs } from "./tracker.ts";
import { confirmationText } from "./tracker.ts";
import { FakeAnthropic, fixtureMap } from "./testing.ts";
import type { ConstructEvidenceRow, ProbeFindingRow, ProfileJson } from "./types.ts";

Deno.test("domainSeverity: single construct → worst; ≥2 → median with worst noted", () => {
  assertEquals(domainSeverity([{ severity: "severe", confidence: 0.8 }]), {
    severity: "severe",
    confidence: 0.8,
  });
  assertEquals(
    domainSeverity([{ severity: "none", confidence: 1 }, { severity: "severe", confidence: 0.5 }]),
    {
      severity: "severe",
      confidence: 0.75,
      worst: "severe",
    },
  );
  const three = domainSeverity([
    { severity: "mild", confidence: 0.9 },
    { severity: "none", confidence: 0.9 },
    { severity: "severe", confidence: 0.9 },
  ]);
  assertEquals(three.severity, "mild");
  assertEquals(three.worst, "severe");
  assertEquals(domainSeverity([{ severity: "unclear", confidence: 0.9 }]).severity, "unclear");
});

const map = fixtureMap();
const active = selectActiveConstructs(map, [], [], "baseline");
let n = 0;
function ev(
  construct_id: string,
  severity: ConstructEvidenceRow["severity"],
  confidence = 0.9,
): ConstructEvidenceRow {
  n++;
  return {
    id: `e${n}`,
    session_id: "s",
    construct_id,
    message_id: "m",
    patient_quote: `q${n}`,
    quote_gloss_en: `g${n}`,
    severity,
    confidence,
    interference: [],
    facets: [],
    triage_item: null,
    note: null,
    superseded_by: null,
    created_at: "",
  };
}

Deno.test("buildDeterministicProfile: buckets, quotes, disclaimer", () => {
  const evidence = [
    ev("appearance.overall", "moderate"),
    ev("appearance.nose", "none"),
    ev("psych.mood", "declined"),
  ];
  const findings = [{
    id: "f",
    session_id: "s",
    construct_id: "appearance.overall",
    finding: "Is this normal?",
    category: "patient_question" as const,
    message_id: null,
    created_at: "",
  }];
  const p = buildDeterministicProfile({
    activeConstructs: active,
    coverage: computeCoverage(map, active, evidence, findings),
    evidence,
    findings,
    language: "en",
    timepoint: "baseline",
    priorProfile: null,
    generatedWith: { model: "m", prompt_version: "v", map: "test-map@1" },
  });
  assertEquals(p.disclaimer, "AI-assisted inferred profile. Not a validated FACE-Q score.");
  const appearance = p.domains.find((d) => d.id === "appearance")!;
  assertEquals(appearance.severity, "moderate");
  assertEquals(appearance.worst_severity, "moderate");
  assertEquals(
    appearance.constructs.find((c) => c.id === "appearance.overall")!.quotes[0].text,
    "q1",
  );
  assertEquals(p.declined, ["psych.mood"]);
  assertEquals(p.not_covered, ["psych.self_consciousness"]);
  assertEquals(p.patient_questions, ["Is this normal?"]);
  assertEquals(p.domains.find((d) => d.id === "psychological")!.severity, "unclear");
});

Deno.test("computeChange: compares construct severities with the prior profile", () => {
  const prior: ProfileJson = {
    generated_with: { model: "", prompt_version: "", map: "" },
    domains: [{
      id: "appearance",
      label: "",
      severity: "severe",
      confidence: 1,
      summary_en: "",
      constructs: [{
        id: "appearance.overall",
        label: "",
        severity: "severe",
        confidence: 1,
        quotes: [],
        findings: [],
        status: "covered",
        facets_covered: [],
        facets_missing: [],
        confirmed: false,
      }],
    }],
    needs_clarification: [],
    not_covered: [],
    declined: [],
    patient_questions: [],
    change_from_prior: [],
    disclaimer: "",
  };
  const now = [{
    id: "appearance",
    label: "",
    severity: "mild" as const,
    confidence: 1,
    summary_en: "",
    constructs: [{
      id: "appearance.overall",
      label: "",
      severity: "mild" as const,
      confidence: 1,
      quotes: [],
      findings: [],
      status: "covered" as const,
      facets_covered: [],
      facets_missing: [],
      confirmed: false,
    }],
  }];
  assertEquals(computeChange(now, prior), [{
    construct_id: "appearance.overall",
    prior: "severe",
    now: "mild",
    note: "improved since prior session",
  }]);
});

Deno.test("generateProfile: merges model narrative, falls back when the model output is unusable", async () => {
  const evidence = [ev("appearance.overall", "mild")];
  const base = {
    activeConstructs: active,
    coverage: computeCoverage(map, active, evidence, []),
    evidence,
    findings: [],
    language: "en" as const,
    timepoint: "baseline" as const,
    priorProfile: null,
    generatedWith: { model: "m", prompt_version: "v", map: "test-map@1" },
  };
  const good = new FakeAnthropic([{
    text:
      '{"domains":[{"id":"appearance","summary_en":"Mostly content."}],"needs_clarification":[],"change_notes":[]}',
  }]);
  const r1 = await generateProfile(base, { client: good, model: "m" });
  assertEquals(r1.narrativeOk, true);
  assertEquals(r1.profile.domains[0].summary_en, "Mostly content.");
  assertEquals(r1.profile.domains[0].severity, "mild");
  const bad = new FakeAnthropic([{ text: "nope" }, { text: "nope again" }]);
  const r2 = await generateProfile(base, { client: bad, model: "m" });
  assertEquals(r2.narrativeOk, false);
  assertEquals(r2.profile.domains[0].severity, "mild");
});

Deno.test("buildDeterministicProfile: v1.1 facet coverage, confirmation and unconfirmed focus", () => {
  const evidence = [
    { ...ev("appearance.overall", "moderate"), facets: ["mirror", "photos"] },
    { ...ev("appearance.nose", "mild"), facets: ["shape"] },
  ];
  const findings: ProbeFindingRow[] = [
    {
      id: "f1",
      session_id: "s",
      construct_id: "appearance.overall",
      finding: confirmationText("the mirror is the hard part"),
      category: "other",
      message_id: null,
      created_at: "",
    },
  ];
  const p = buildDeterministicProfile({
    activeConstructs: active,
    coverage: computeCoverage(map, active, evidence, findings),
    evidence,
    findings,
    language: "en",
    timepoint: "baseline",
    priorProfile: null,
    focusConstructs: ["appearance.overall", "appearance.nose"],
    generatedWith: { model: "m", prompt_version: "v", map: "test-map@1" },
  });
  const constructs = p.domains.flatMap((d) => d.constructs);
  const overall = constructs.find((c) => c.id === "appearance.overall")!;
  assertEquals(overall.facets_covered, ["mirror", "photos"]);
  assertEquals(overall.facets_missing, ["wanted_change"]);
  assertEquals(overall.confirmed, true);
  // The confirmation marker is tracker bookkeeping, not a clinical finding.
  assertEquals(overall.findings, []);

  const nose = constructs.find((c) => c.id === "appearance.nose")!;
  assertEquals(nose.facets_covered, ["shape"]);
  assertEquals(nose.confirmed, false);
  // An unconfirmed focus construct is handed to the clinician.
  assertEquals(p.needs_clarification.map((n) => n.construct_id), ["appearance.nose"]);
});
