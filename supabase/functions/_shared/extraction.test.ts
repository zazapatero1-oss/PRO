import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  persistExtraction,
  quoteIsFromMessage,
  validateEvidence,
  validateExtraction,
} from "./extraction.ts";
import { selectActiveConstructs } from "./tracker.ts";
import { FakeDb, fixtureMap } from "./testing.ts";
import type { TriageItem } from "./types.ts";

const map = fixtureMap();
const active = selectActiveConstructs(map, [], [], "baseline");
const triage: TriageItem[] = map.triage ?? [];
const MESSAGE = "My nose is the worst bit, especially the shape in photos.";

Deno.test("quoteIsFromMessage: whitespace and case are forgiven, invention is not", () => {
  assert(quoteIsFromMessage("the shape in photos", MESSAGE));
  assert(quoteIsFromMessage("My   nose is\nthe worst bit", MESSAGE));
  assertFalse(quoteIsFromMessage("my chin bothers me", MESSAGE));
});

Deno.test("validateEvidence: unknown facets are dropped, severity and confidence are checked", () => {
  const ev = validateEvidence({
    construct_id: "appearance.nose",
    patient_quote: "the shape in photos",
    quote_gloss_en: "",
    severity: "moderate",
    confidence: 0.833,
    interference: ["social", "made-up"],
    facets: ["shape", "nope"],
    triage_item: "features",
    note: " avoids photos ",
  }, active);
  assertEquals(ev.facets, ["shape"]);
  assertEquals(ev.interference, ["social"]);
  assertEquals(ev.confidence, 0.83);
  assertEquals(ev.quote_gloss_en, "the shape in photos");
  assertEquals(ev.note, "avoids photos");

  for (
    const bad of [
      { construct_id: "nope", patient_quote: "x", severity: "mild", confidence: 0.5 },
      { construct_id: "appearance.nose", patient_quote: "x", severity: "awful", confidence: 0.5 },
      { construct_id: "appearance.nose", patient_quote: "x", severity: "mild", confidence: 7 },
    ]
  ) {
    let threw = false;
    try {
      validateEvidence(bad, active);
    } catch {
      threw = true;
    }
    assert(threw, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

Deno.test("validateExtraction: drops unknown ids, unquoted evidence and unknown triage items", () => {
  const result = validateExtraction(
    {
      evidence: [
        {
          construct_id: "appearance.nose",
          patient_quote: "the shape in photos",
          quote_gloss_en: "the shape in photos",
          severity: "moderate",
          confidence: 0.8,
          interference: [],
          facets: ["shape"],
          triage_item: "nonexistent",
        },
        {
          construct_id: "appearance.overall",
          patient_quote: "I never said this",
          quote_gloss_en: "I never said this",
          severity: "severe",
          confidence: 0.9,
          interference: [],
          facets: [],
        },
      ],
      findings: [
        { construct_id: "appearance.nose", category: "impact", finding: "Avoids photos" },
        { construct_id: "ghost", category: "impact", finding: "ignored" },
        { construct_id: "appearance.nose", category: "made_up", finding: "kept as other" },
      ],
      declined: ["psych.mood", "ghost"],
      triage_answered: ["features", "ghost"],
      confirmed: ["appearance.nose", "ghost"],
      patient_questions: ["Is this normal?"],
    },
    active,
    triage,
    MESSAGE,
  );

  assertEquals(result.evidence.length, 1);
  assertEquals(result.evidence[0].triage_item, null);
  assertEquals(result.findings.map((f) => f.category), ["impact", "other"]);
  assertEquals(result.declined, ["psych.mood"]);
  assertEquals(result.triage_answered, ["features"]);
  assertEquals(result.confirmed, ["appearance.nose"]);
  assertEquals(result.patient_questions, ["Is this normal?"]);
});

Deno.test("persistExtraction: declines become evidence, confirmations become marked findings", async () => {
  const db = new FakeDb();
  const events = await persistExtraction({
    db,
    sessionId: "s1",
    messageId: "m1",
    patientMessage: MESSAGE,
    lastAssistantMessage: "So your nose is the main thing — right?",
    result: {
      evidence: [{
        construct_id: "appearance.nose",
        patient_quote: "the shape in photos",
        quote_gloss_en: "the shape in photos",
        severity: "moderate",
        confidence: 0.8,
        interference: [],
        facets: ["shape"],
        triage_item: "features",
      }],
      findings: [],
      declined: ["psych.mood"],
      triage_answered: ["features"],
      confirmed: ["appearance.nose", "appearance.overall"],
      patient_questions: ["Is this normal?"],
    },
    alreadyConfirmed: new Set(["appearance.overall"]),
    defaultConstructId: "appearance.nose",
  });

  assertEquals(events, [
    { construct_id: "appearance.nose", severity: "moderate", confidence: 0.8 },
    { construct_id: "psych.mood", severity: "declined", confidence: 1 },
  ]);
  assertEquals(db.evidence.length, 2);
  assertEquals(db.evidence[0].facets, ["shape"]);
  assertEquals(db.evidence[0].triage_item, "features");
  assertEquals(db.evidence[1].severity, "declined");
  assertEquals(db.evidence[1].facets, []);

  // Only the not-yet-confirmed construct got a confirmation row.
  const confirmations = db.findings.filter((f) => f.category === "other");
  assertEquals(confirmations.length, 1);
  assertEquals(confirmations[0].construct_id, "appearance.nose");
  assertEquals(confirmations[0].finding, "confirmed: So your nose is the main thing — right?");
  assertEquals(db.findings.filter((f) => f.category === "patient_question").length, 1);
});
