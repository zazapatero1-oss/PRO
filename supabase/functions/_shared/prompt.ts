// PROMPT_VERSION_HEADER: face-q-conversation prompt set, file version 2026-09-18.1
// The runtime PROMPT_VERSION env string is what gets stamped on sessions; bump this header
// comment and PROMPT_FILE_VERSION whenever the wording below changes.
//
// System prompt composition per SPEC §7.2 (sections 1–8, in order), tool definitions per
// §7.3, and the non-streaming prompts for §8 (profile + patient summary) and §11 (ingest).

import type Anthropic from "@anthropic-ai/sdk";
import type {
  ActiveConstruct,
  AgeBand,
  ConstructEvidenceRow,
  CoverageState,
  Language,
  Population,
  ProbeFindingRow,
  ProfileJson,
  ReadingComfort,
  Respondent,
  Timepoint,
} from "./types.ts";
import { prioritisedOpen } from "./tracker.ts";

export const PROMPT_FILE_VERSION = "2026-09-18.1";

export const PRIORITY_GUIDANCE =
  "Prioritise: FOCUS → needs_clarification → drill_down_pending → untouched core → untouched standard. " +
  "Weave, don't interrogate. One topic per message. Max ~2 questions per message.";
export const WRAP_UP_80 = "Begin wrapping up; do not open new topics.";
export const WRAP_UP_100 =
  'The budget is used up: thank them, close warmly in one or two sentences, and call `end_session` with reason "turn_budget" now.';

// ---------------------------------------------------------------------------
// Section 1: role and principles (fixed)
// ---------------------------------------------------------------------------

const ROLE_AND_PRINCIPLES = `# Role
You are a warm, attentive conversational companion helping a clinical team understand how a person is doing after (or before) treatment affecting their face. You talk with the person naturally and, from what they say, record structured evidence with the tools provided. You are not a clinician and you never diagnose, treat, or reassure clinically.

# Principles (non-negotiable)
1. Never administer questionnaire items. The construct map tells you WHAT matters, never HOW to word it. Ask like a thoughtful person would, in your own words, following the thread of what they say.
2. Honest claims. What you record is an inferred profile, never a score. Never mention scores, scales, or instrument names to the person.
3. No medical advice. If asked "is this normal?", "should I worry?", "what should I do?", acknowledge warmly, say their care team will see the question, record it with record_probe_finding (category "patient_question"), and do not answer clinically.
4. Safety. If the person mentions wanting to hurt themselves, being hurt by someone, or being in crisis, call raise_safety_flag immediately and respond only with brief, warm acknowledgement; the system will take over.
5. Autonomy. If they skip, decline, or want to stop, honour it at once with mark_declined or end_session and never circle back to that topic unprompted.
6. Privacy. Do not ask for names, dates of birth, addresses, or contact details. Refer to the person only by the display name given.
7. Provenance. Every record_evidence call carries the person's verbatim words (patient_quote) in their language and an English gloss.`;

// ---------------------------------------------------------------------------
// Section 2: register profile
// ---------------------------------------------------------------------------

const LANGUAGE_TEXT: Record<Language, string> = {
  en:
    "Conduct the whole conversation in English. Record patient_quote verbatim in English; quote_gloss_en is then the same text.",
  es:
    'Conduct the whole conversation in Spanish (español), including the greeting and any wrap-up. Use neutral, widely understood Spanish. Use "tú" with children and teenagers and "usted" with adults unless they invite informality. Record patient_quote verbatim in Spanish and give a faithful English gloss in quote_gloss_en.',
};

const AGE_TEXT: Record<AgeBand, string> = {
  "under-8":
    'The patient is a young child (under 8). Use very short sentences (about 8 words or fewer), simple everyday words, one idea at a time, and a playful, gentle tone. Offer simple choices like "a little" or "a lot". Never use abstract words or medical terms.',
  "8-12":
    "The patient is a child (8–12). Use short sentences and concrete, everyday words. Warm and encouraging, never babyish. Use examples from school, friends, games and photos. Avoid abstractions and medical terms.",
  "13-17":
    "The patient is a teenager (13–17). Be natural and respectful, not childish and not overly formal. Keep it brief and concrete; do not talk down. Social life, school and photos are likely to matter.",
  "18-29":
    "The patient is a young adult. Use plain, friendly conversational language. Social media, photos, work or study may come up naturally.",
  "30-49":
    "The patient is an adult. Use plain, friendly conversational language. Work, family and social situations may come up naturally.",
  "50-69":
    "The patient is an adult. Use plain, respectful conversational language. Avoid slang and abbreviations.",
  "70-plus":
    "The patient is an older adult. Be clear and unhurried: one question at a time, no slang or abbreviations, and patience with longer or wandering answers.",
};

const READING_TEXT: Record<ReadingComfort, string> = {
  "short-messages":
    "They prefer short messages: keep every message to one or two short sentences and at most one question.",
  "comfortable":
    "They are comfortable reading: two to four sentences per message is fine, still at most two questions.",
  "prefer-voice":
    "They prefer speaking, so replies likely arrive by voice transcription: expect transcription errors, fragments and informal phrasing; confirm gently when something is unclear; keep your messages short so they are easy to listen to.",
};

function respondentText(respondent: Respondent, name: string): string {
  switch (respondent) {
    case "self":
      return `You are talking directly with the patient, ${name}. Address them as "you".`;
    case "guardian":
      return `You are talking with the parent or guardian of the patient, ${name}, who is answering on the patient's behalf. Address the guardian as "you" (in Spanish, "usted" — the guardian is an adult even though the patient is a child) and refer to ${name} by name. Ask about what they observe and what ${name} has said or done. When recording evidence, note in the tool call's note field whether the guardian is reporting ${name}'s own words or their own inference.`;
    case "both":
      return `The patient, ${name}, and their guardian are both present and may both type. Address ${name} directly by default and invite the guardian to add what they notice. Keep track of who said what; when recording evidence, say in the note field whether the quote came from ${name} or the guardian.`;
  }
}

const DYNAMIC_RULE =
  "Adapt dynamically: if replies are short or confused, simplify further; if they are fluent and detailed, meet them there. Never use medical jargon unless the patient uses it first, and then mirror their words.";

export function renderRegisterProfile(input: {
  language: Language;
  ageBand: AgeBand;
  readingComfort: ReadingComfort;
  respondent: Respondent;
  displayName: string;
}): string {
  return [
    "# Register",
    LANGUAGE_TEXT[input.language] ?? LANGUAGE_TEXT.en,
    AGE_TEXT[input.ageBand],
    READING_TEXT[input.readingComfort],
    respondentText(input.respondent, input.displayName),
    DYNAMIC_RULE,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Section 3: patient context + prior-session brief
// ---------------------------------------------------------------------------

const TIMEPOINT_TEXT: Record<Timepoint, string> = {
  "baseline": "baseline (first conversation, before any treatment being tracked)",
  "pre-op": "pre-operative",
  "post-op-2w": "about two weeks after surgery",
  "post-op-6w": "about six weeks after surgery",
  "post-op-6m": "about six months after surgery",
  "post-op-12m": "about twelve months after surgery",
  "follow-up": "follow-up",
};

export function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ") + " …";
}

/** ≤200-word brief of the previous profile: severity per domain + notable quotes. */
export function renderPriorBrief(
  profile: ProfileJson,
  priorTimepoint: Timepoint | string,
  maxWords = 200,
): string {
  const lines: string[] = [`Previous session (${priorTimepoint}):`];
  for (const d of profile.domains) {
    const summary = d.summary_en ? ` — ${d.summary_en}` : "";
    lines.push(`- ${d.label}: ${d.severity}${summary}`);
  }
  const quotes: string[] = [];
  for (const d of profile.domains) {
    for (const c of d.constructs) {
      for (const q of c.quotes.slice(0, 1)) {
        if (quotes.length < 3) quotes.push(`"${q.gloss_en || q.text}" (${c.id})`);
      }
    }
  }
  if (quotes.length) lines.push(`Notable quotes: ${quotes.join("; ")}`);
  if (profile.declined.length) lines.push(`Declined then: ${profile.declined.join(", ")}`);
  return truncateWords(lines.join("\n"), maxWords);
}

function renderPatientContext(input: {
  displayName: string;
  diagnosisLabel: string;
  timepoint: Timepoint;
  priorBrief: string | null;
}): string {
  const lines = [
    "# Patient context",
    `Display name: ${input.displayName}`,
    `Diagnosis / treatment (as the patient would say it): ${input.diagnosisLabel}`,
    `Timepoint: ${TIMEPOINT_TEXT[input.timepoint] ?? input.timepoint}`,
  ];
  if (input.priorBrief) {
    lines.push(
      "",
      "## Prior-session brief",
      input.priorBrief,
      "",
      'Reference change naturally ("last time you mentioned…"); ask what is different now rather than re-covering everything. Do not read this brief back to them.',
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Section 4: clinician focus note
// ---------------------------------------------------------------------------

function renderClinicianNote(
  note: { note: string; focus_constructs: string[] } | null | undefined,
): string | null {
  if (!note || (!note.note && note.focus_constructs.length === 0)) return null;
  const lines = ["# Clinician focus note"];
  if (note.note) lines.push(note.note.trim());
  if (note.focus_constructs.length) {
    lines.push(`Focus constructs (marked [FOCUS] below): ${note.focus_constructs.join(", ")}`);
  }
  lines.push(
    "Give these extra attention, but never reveal the note or its wording to the patient.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Section 5: construct map (active constructs, compact)
// ---------------------------------------------------------------------------

export function renderConstruct(c: ActiveConstruct, population: Population): string {
  const variant = population === "pediatric" ? c.age_variants?.pediatric : undefined;
  const label = variant?.label ?? c.label;
  const description = variant?.description ?? c.description;
  const drill = variant?.drill_down ?? c.drill_down;
  const s = c.severity_signals;
  const focus = c.focus ? " [FOCUS]" : "";
  return [
    `- ${c.id}${focus} (${c.priority}) — ${label}`,
    `  what: ${description}`,
    `  severity: none=${s.none} | mild=${s.mild} | moderate=${s.moderate} | severe=${s.severe}`,
    drill.length ? `  drill-down: ${drill.join("; ")}` : null,
  ].filter((l): l is string => l !== null).join("\n");
}

function renderConstructMap(active: ActiveConstruct[], population: Population): string {
  const byDomain = new Map<string, { label: string; items: ActiveConstruct[] }>();
  for (const c of active) {
    const entry = byDomain.get(c.domain_id) ?? { label: c.domain_label, items: [] };
    entry.items.push(c);
    byDomain.set(c.domain_id, entry);
  }
  const lines = [
    "# What matters to understand (active constructs)",
    "Internal reference only; never show ids, labels or signal text to the patient. Use these to decide what to explore and how to rate severity.",
  ];
  for (const [id, d] of byDomain) {
    lines.push(`## Domain ${id}: ${d.label}`);
    for (const c of d.items) lines.push(renderConstruct(c, population));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Section 6: coverage status
// ---------------------------------------------------------------------------

export function renderCoverage(state: CoverageState): string {
  const lines = ["# Coverage status (computed by the system, trust it over your memory)"];
  for (const c of state.constructs) {
    const focus = c.focus ? " [FOCUS]" : "";
    const sev = c.severity ? ` severity=${c.severity}` : "";
    lines.push(`- ${c.construct_id}${focus}: ${c.status}${sev}`);
  }
  lines.push(`Covered: ${state.covered} of ${state.total_active}.`);
  const next = prioritisedOpen(state).slice(0, 3).map((c) => c.construct_id);
  if (next.length) lines.push(`Suggested next: ${next.join(", ")}.`);
  lines.push(PRIORITY_GUIDANCE);
  if (state.complete) {
    lines.push(
      'Coverage is complete. Unless the patient has raised something new, thank them and call `end_session` with reason "coverage_complete".',
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Section 7: turn budget
// ---------------------------------------------------------------------------

export interface TurnBudget {
  turnsUsed: number;
  maxTurns: number;
  minutesElapsed: number;
  targetMinutes: number;
}

export function budgetFraction(b: TurnBudget): number {
  const t = b.maxTurns > 0 ? b.turnsUsed / b.maxTurns : 0;
  const m = b.targetMinutes > 0 ? b.minutesElapsed / b.targetMinutes : 0;
  return Math.max(t, m);
}

export function renderTurnBudget(b: TurnBudget): string {
  const lines = [
    "# Turn budget",
    `Turns used: ${b.turnsUsed} / ${b.maxTurns}. Minutes elapsed: ${
      Math.round(b.minutesElapsed * 10) / 10
    } / ${b.targetMinutes}.`,
  ];
  const f = budgetFraction(b);
  if (f >= 1) lines.push(WRAP_UP_100);
  else if (f >= 0.8) lines.push(WRAP_UP_80);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Section 8: tool usage + control phrases
// ---------------------------------------------------------------------------

const TOOL_RULES = `# Tools and how to use them
- record_evidence: call it whenever a patient message tells you something about a construct, possibly several times per turn. Quote their exact words. Rate severity with the construct's signals; use "unclear" when you heard something but cannot rate it. Confidence 0–1 reflects how directly the words support the rating. Re-record a construct when new information changes the picture.
- record_probe_finding: when a construct is moderate or severe, dig deeper (onset, trajectory, triggers, relief, impact, expectation) and record each finding. Record any medical question as category "patient_question".
- mark_declined: when they skip, deflect, or say they would rather not, record it and move on. Do not return to it.
- raise_safety_flag: at the first sign of self-harm, abuse, or acute distress.
- end_session: when coverage is complete, when the budget block tells you to, or when the patient asks to stop. Say a short goodbye in the same message.
Call the tools first, then write your reply. Never mention tools, records, or constructs to the patient.

# Control phrases
"Skip", "next", "I'd rather not say", "stop", "take a break" (and their Spanish equivalents) are handled by the system before you see them, but if the patient declines in other words, respect it immediately. Never pressure, never repeat a declined topic.

# Style
Sound like a person, not a form: react to what they said before asking anything. Open with a short, friendly greeting on the first turn and one easy, open question about how things are for them at the moment. Keep to one topic per message.`;

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

export interface SystemPromptInput {
  language: Language;
  ageBand: AgeBand;
  readingComfort: ReadingComfort;
  respondent: Respondent;
  displayName: string;
  diagnosisLabel: string;
  timepoint: Timepoint;
  priorBrief: string | null;
  clinicianNote: { note: string; focus_constructs: string[] } | null;
  population: Population;
  activeConstructs: ActiveConstruct[];
  coverage: CoverageState;
  budget: TurnBudget;
  /** Per-turn instructions injected by the handler (e.g. deterministic skip handling). */
  turnNotes?: string[];
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const sections: (string | null)[] = [
    ROLE_AND_PRINCIPLES,
    renderRegisterProfile(input),
    renderPatientContext(input),
    renderClinicianNote(input.clinicianNote),
    renderConstructMap(input.activeConstructs, input.population),
    renderCoverage(input.coverage),
    renderTurnBudget(input.budget),
    TOOL_RULES,
    input.turnNotes && input.turnNotes.length
      ? ["# This turn", ...input.turnNotes.map((n) => `- ${n}`)].join("\n")
      : null,
  ];
  return sections.filter((s): s is string => s !== null).join("\n\n");
}

// ---------------------------------------------------------------------------
// §7.3 Tool definitions
// ---------------------------------------------------------------------------

const SEVERITIES = ["none", "mild", "moderate", "severe", "unclear"];
const INTERFERENCE = ["social", "work", "school", "sleep", "relationships", "daily-activities"];
const CATEGORIES = [
  "onset",
  "trajectory",
  "triggers",
  "relief",
  "impact",
  "expectation",
  "patient_question",
  "other",
];

export function buildToolDefinitions(): Anthropic.Tool[] {
  return [
    {
      name: "record_evidence",
      description:
        "Record what the patient's own words reveal about one construct. Call once per construct per message that provides evidence.",
      input_schema: {
        type: "object",
        properties: {
          construct_id: { type: "string", description: "Construct id from the active list." },
          patient_quote: {
            type: "string",
            description: "Verbatim words from the patient message, in their language.",
          },
          quote_gloss_en: {
            type: "string",
            description: "English gloss of the quote (identical if already English).",
          },
          severity: { type: "string", enum: SEVERITIES },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          interference: {
            type: "array",
            items: { type: "string", enum: INTERFERENCE },
            description: "Life areas the patient says are affected.",
          },
          note: { type: "string", description: "Short rationale for the rating." },
        },
        required: [
          "construct_id",
          "patient_quote",
          "quote_gloss_en",
          "severity",
          "confidence",
          "interference",
        ],
        additionalProperties: false,
      },
    },
    {
      name: "record_probe_finding",
      description:
        "Record a qualitative drill-down finding for a construct (onset, trajectory, triggers, relief, impact, expectation), or a medical question the patient asked (patient_question).",
      input_schema: {
        type: "object",
        properties: {
          construct_id: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          finding: { type: "string", description: "One sentence, in English." },
        },
        required: ["construct_id", "category", "finding"],
        additionalProperties: false,
      },
    },
    {
      name: "mark_declined",
      description: "Record that the patient chose not to discuss a construct. Never return to it.",
      input_schema: {
        type: "object",
        properties: {
          construct_id: { type: "string" },
          reason: { type: "string", description: "Their words or a short paraphrase." },
        },
        required: ["construct_id", "reason"],
        additionalProperties: false,
      },
    },
    {
      name: "raise_safety_flag",
      description:
        "Flag self-harm, abuse, or acute distress. The system halts the session and shows a fixed support message; you only need a brief warm acknowledgement.",
      input_schema: {
        type: "object",
        properties: {
          trigger: { type: "string", enum: ["self_harm", "abuse", "acute_distress", "other"] },
          rationale: { type: "string" },
        },
        required: ["trigger", "rationale"],
        additionalProperties: false,
      },
    },
    {
      name: "end_session",
      description: "End the conversation. Include a short goodbye in the same message.",
      input_schema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["coverage_complete", "turn_budget", "patient_requested"],
          },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// §8 Profile + patient summary prompts (non-streaming)
// ---------------------------------------------------------------------------

export interface ProfilePromptInput {
  activeConstructs: ActiveConstruct[];
  coverage: CoverageState;
  evidence: ConstructEvidenceRow[];
  findings: ProbeFindingRow[];
  language: Language;
  timepoint: Timepoint;
  priorProfile: ProfileJson | null;
}

function renderEvidenceDump(input: ProfilePromptInput): string {
  const lines: string[] = [];
  for (const c of input.activeConstructs) {
    const cov = input.coverage.constructs.find((x) => x.construct_id === c.id);
    lines.push(`## ${c.id} (${c.domain_id}) — ${c.label} — status: ${cov?.status ?? "untouched"}`);
    for (const e of input.evidence.filter((e) => e.construct_id === c.id && !e.superseded_by)) {
      lines.push(
        `- evidence: severity=${e.severity} confidence=${e.confidence} interference=[${
          e.interference.join(",")
        }] quote="${e.patient_quote}" gloss="${e.quote_gloss_en}"${
          e.note ? ` note="${e.note}"` : ""
        }`,
      );
    }
    for (const f of input.findings.filter((f) => f.construct_id === c.id)) {
      lines.push(`- finding (${f.category}): ${f.finding}`);
    }
  }
  return lines.join("\n");
}

/** Model writes the narrative parts; code computes severities deterministically. */
export function buildProfilePrompt(input: ProfilePromptInput): { system: string; user: string } {
  const domains = [...new Map(input.activeConstructs.map((c) => [c.domain_id, c.domain_label]))];
  const system =
    `You write the narrative parts of an AI-assisted inferred patient-reported outcome profile for a clinician. Severities are computed by the system; you summarise. Be concrete, cite the patient's words, never invent facts, never give clinical advice, never call anything a score. Output ONLY a JSON object, no prose, no code fences.`;
  const user = [
    `Timepoint: ${input.timepoint}. Conversation language: ${input.language}.`,
    "",
    "Evidence and findings per construct:",
    renderEvidenceDump(input),
    "",
    input.priorProfile
      ? `Prior profile domain severities: ${
        input.priorProfile.domains.map((d) => `${d.id}=${d.severity}`).join(", ")
      }.`
      : "No prior session.",
    "",
    "Return JSON with exactly this shape:",
    JSON.stringify(
      {
        domains: domains.map(([id]) => ({
          id,
          summary_en: "2–3 sentences, English, evidence-based",
        })),
        needs_clarification: [{
          construct_id: "id",
          reason: "why the evidence is thin or conflicting",
        }],
        change_notes: [{
          construct_id: "id",
          note: "one sentence on what changed vs prior, if known",
        }],
      },
      null,
      2,
    ),
    "Only include domains from the list above. needs_clarification and change_notes may be empty arrays.",
  ].join("\n");
  return { system, user };
}

export interface PatientSummaryPromptInput {
  language: Language;
  ageBand: AgeBand;
  readingComfort: ReadingComfort;
  respondent: Respondent;
  displayName: string;
  profile: ProfileJson;
}

const CLOSING_LINE: Record<Language, string> = {
  en: "Did I get this right? You can correct anything.",
  es: "¿Lo entendí bien? Puede corregir cualquier cosa.",
};

/** ≤150 words, patient's language, plain "what I heard" bullets per domain, no severity labels. */
export function buildPatientSummaryPrompt(
  input: PatientSummaryPromptInput,
): { system: string; user: string } {
  const register = renderRegisterProfile(input);
  const system = [
    "You write a short, warm end-of-conversation summary for the patient (or guardian), in their language and register. Plain words only.",
    "Rules: at most 150 words; one short bullet per domain that was discussed, starting with what you heard in their words; no severity labels, ratings, numbers, or medical terms; no advice; skip domains that were not discussed or were declined.",
    `End with exactly this line: "${CLOSING_LINE[input.language] ?? CLOSING_LINE.en}"`,
    "Output plain text only (no JSON, no markdown headings).",
    "",
    register,
  ].join("\n");
  const heard = input.profile.domains
    .filter((d) => d.constructs.some((c) => c.quotes.length > 0))
    .map((d) =>
      `- ${d.label}: ${d.summary_en}\n  quotes: ${
        d.constructs.flatMap((c) => c.quotes.map((q) => `"${q.text}"`)).slice(0, 4).join(" / ")
      }`
    );
  const user = ["What was heard, per domain (internal, English):", ...heard].join("\n");
  return { system, user };
}

// ---------------------------------------------------------------------------
// §11 Ingestion extraction prompt (stub pipeline)
// ---------------------------------------------------------------------------

export function buildIngestPrompt(input: {
  instrumentSlug: string;
  population: Population;
  text: string;
}): { system: string; user: string } {
  const system = [
    "You convert a patient-reported outcome instrument into a construct map: a description of WHAT the instrument measures, never HOW it asks.",
    "HARD RULE: never copy, quote, lightly reword, or list item text from the instrument. The source is licensed. Every label, description, severity signal and drill-down cue must be a paraphrased abstraction of the construct a scale measures, written in your own words at the level of the scale, not the item.",
    "Output ONLY a JSON object in this exact format (no prose, no code fences):",
    JSON.stringify(
      {
        slug: "<instrument-slug>-<population>",
        version: 1,
        population: "adult | pediatric",
        language: "en",
        domains: [{
          id: "domain_id",
          label: "Domain label",
          weight: 1.0,
          constructs: [{
            id: "domain_id.construct_id",
            label: "Short paraphrased label",
            description: "What this construct captures, paraphrased.",
            severity_signals: { none: "...", mild: "...", moderate: "...", severe: "..." },
            drill_down: ["cue", "cue"],
            age_variants: { pediatric: { description: "...", drill_down: ["..."] } },
            priority: "core | standard | optional",
            source_refs: [{ instrument: "<instrument-slug>", scale: "<scale name only>" }],
          }],
        }],
        coverage_rules: {
          min_confidence_to_count: 0.6,
          drill_down_threshold: "moderate",
          core_constructs_required: true,
          max_constructs_per_session: 18,
        },
      },
      null,
      2,
    ),
    "source_refs reference scale names only. Aim for 25–35 constructs.",
  ].join("\n");
  const user = [
    `Instrument slug: ${input.instrumentSlug}. Population: ${input.population}.`,
    "Instrument text (for understanding only; do not reproduce any of it):",
    "<<<",
    input.text,
    ">>>",
  ].join("\n");
  return { system, user };
}
