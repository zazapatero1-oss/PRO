import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { buildCsv, buildFhirBundle, CSV_HEADER } from "./export.ts";
import type { ParticipantRow, ProfileJson, SafetyFlagRow, SessionRow } from "./types.ts";

const participant: ParticipantRow = {
  id: "p1",
  study_id: "P-0042",
  display_name: "Ana",
  preferred_language: "es",
  age_band: "30-49",
  reading_comfort: "comfortable",
  diagnosis_code: "facelift",
  diagnosis_text: null,
  is_demo: false,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
};
const session: SessionRow = {
  id: "s1",
  participant_id: "p1",
  timepoint: "post-op-6w",
  respondent: "self",
  language: "es",
  construct_map_id: "m1",
  prompt_version: "v1",
  model_id: "claude-sonnet-5",
  status: "completed",
  phase: "wrap-up",
  focus_constructs: ["appearance.overall"],
  resume_token_expires_at: null,
  screen_scores: null,
  screen_completed_at: null,
  resume_token_hash: "h",
  max_turns: 40,
  target_minutes: 12,
  started_at: "2026-01-02T10:00:00Z",
  ended_at: "2026-01-02T10:12:00Z",
  consent_given_at: null,
  consent_variant: "adult",
  input_tokens: 1,
  output_tokens: 1,
  cost_usd_estimate: null,
  created_at: "2026-01-02T09:59:00Z",
};
const profile: ProfileJson = {
  generated_with: { model: "claude-sonnet-5", prompt_version: "v1", map: "face-q-adult@1" },
  domains: [{
    id: "appearance",
    label: "Appearance",
    severity: "moderate",
    confidence: 0.7,
    summary_en: "Some concerns.",
    constructs: [
      {
        id: "appearance.overall",
        label: "Overall",
        severity: "moderate",
        confidence: 0.7,
        quotes: [{
          text: 'no me gusta, "en serio"',
          lang: "es",
          gloss_en: 'I don\'t like it, "really"',
        }],
        findings: [{ category: "impact", text: "Avoids photos" }],
        status: "covered",
        facets_covered: ["mirror", "photos"],
        facets_missing: ["wanted_change"],
        confirmed: true,
      },
      {
        id: "appearance.nose",
        label: "Nose",
        severity: "declined",
        confidence: 0,
        quotes: [],
        findings: [],
        status: "declined",
        facets_covered: [],
        facets_missing: [],
        confirmed: false,
      },
      {
        id: "appearance.skin",
        label: "Skin",
        severity: "unclear",
        confidence: 0,
        quotes: [],
        findings: [],
        status: "untouched",
        facets_covered: [],
        facets_missing: [],
        confirmed: false,
      },
    ],
  }],
  needs_clarification: [],
  not_covered: ["appearance.skin"],
  declined: ["appearance.nose"],
  patient_questions: [],
  change_from_prior: [],
  disclaimer: "AI-assisted inferred profile. Not a validated FACE-Q score.",
};
const flags: SafetyFlagRow[] = [{
  id: "f1",
  session_id: "s1",
  message_id: null,
  trigger: "acute_distress",
  detected_by: "keyword",
  action_taken: "halt",
  reviewed_by: null,
  reviewed_at: null,
  created_at: "2026-01-02T10:05:00Z",
}];

Deno.test("FHIR bundle: Patient, Encounter, one Observation per covered construct, Composition, Flag; no QuestionnaireResponse", () => {
  const bundle = buildFhirBundle({ participant, session, profile, safetyFlags: flags }) as {
    resourceType: string;
    type: string;
    entry: { resource: Record<string, unknown> }[];
  };
  assertEquals(bundle.resourceType, "Bundle");
  assertEquals(bundle.type, "collection");
  const types = bundle.entry.map((e) => e.resource.resourceType);
  assertEquals(types, ["Patient", "Encounter", "Observation", "Composition", "Flag"]);
  assertFalse(types.includes("QuestionnaireResponse"));
  const patient = bundle.entry[0].resource;
  assertEquals(patient.id, "P-0042");
  assertFalse("birthDate" in patient);
  const obs = bundle.entry[2].resource as {
    code: { text: string };
    valueCodeableConcept: { text: string };
    note: { text: string }[];
    extension: { url: string; valueDecimal?: number }[];
  };
  assertEquals(obs.code.text, "Overall");
  assertEquals(obs.valueCodeableConcept.text, "moderate");
  assertStringIncludes(obs.note[0].text, "no me gusta");
  assert(obs.extension.some((e) => e.url.endsWith("confidence") && e.valueDecimal === 0.7));
  const comp = bundle.entry[3].resource as { section: { text: { div: string } }[] };
  assertStringIncludes(comp.section[1].text.div, "Not a validated FACE-Q score");
});

Deno.test("CSV: header, one row per construct, quotes escaped", () => {
  const csv = buildCsv({ participant, session, profile, safetyFlags: [] });
  const lines = csv.trim().split("\r\n");
  assertEquals(lines[0], CSV_HEADER.join(","));
  assertEquals(lines.length, 4);
  assertStringIncludes(
    lines[1],
    'P-0042,post-op-6w,Appearance,Overall,moderate,0.7,"no me gusta, ""en serio""","I don\'t like it, ""really""",impact: Avoids photos,covered',
  );
  assertStringIncludes(lines[2], "declined");
});
