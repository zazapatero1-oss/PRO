// PROMPT_VERSION_HEADER: face-q-conversation prompt set, file version 2026-09-18.2
// The runtime PROMPT_VERSION env string is what gets stamped on sessions; bump this header
// comment and PROMPT_FILE_VERSION whenever the wording below changes.
//
// System prompt composition per SPEC §7.2 with the v1.1 §B phase guidance, and the
// non-streaming prompts for §C (extraction), §8 (profile + patient summary) and §E (ingest).
// v1.1: the conversational call carries NO tools, so nothing here mentions any.

import type {
  ActiveConstruct,
  AgeBand,
  ConstructEvidenceRow,
  ConstructMap,
  CoverageState,
  Facet,
  Language,
  Population,
  ProbeFindingRow,
  ProfileJson,
  ReadingComfort,
  Respondent,
  Timepoint,
  TrackerState,
  TriageItem,
} from "./types.ts";
import { facetsOf, prioritisedOpen } from "./tracker.ts";

export const PROMPT_FILE_VERSION = "2026-09-18.2";

export const PRIORITY_GUIDANCE =
  "Prioritise: FOCUS → needs_clarification → drill_down_pending → untouched core → untouched standard. " +
  "Weave, don't interrogate. One topic per message. Max ~2 questions per message. " +
  "For needs_clarification: reflect back what you heard in your own words and check it once more before moving on; " +
  "only if it is still unclear leave it for the clinician.";
export const WRAP_UP_80 = "Begin wrapping up; do not open new topics.";
export const WRAP_UP_100 =
  "The budget is used up: thank them and close warmly in one or two sentences. Do not ask anything new.";
/** v1.1 §B phase guidance, verbatim; the handler only fills in the item / focus / facets. */
export const TRIAGE_GUIDANCE_SUFFIX =
  "— in your own words, in the patient's register; one item per message; do not explore yet.";
export const EXPLORE_GUIDANCE =
  "Stay on this topic, one detail per question, in the patient's words. When the list is covered (or they decline), " +
  "reflect back what you heard in one or two sentences and ask if that's right; wait for their answer before moving on. " +
  "If you already asked about a detail and they did not address it, do not ask it again; move to the next detail. " +
  "Follow the patient's thread: if they are clearly talking about a different area on the focus list, explore that one now.";

// ---------------------------------------------------------------------------
// Section 1: role and principles (fixed)
// ---------------------------------------------------------------------------

const ROLE_AND_PRINCIPLES = `# Role
You are a warm, attentive conversational companion helping a clinical team understand how a person is doing after (or before) treatment affecting their face. You talk with the person naturally; a separate system reads the conversation afterwards and files what it hears. Your only job is the conversation itself. You are not a clinician and you never diagnose, treat, or reassure clinically.

# Principles (non-negotiable)
1. Never administer questionnaire items. The construct map tells you WHAT matters, never HOW to word it. Ask like a thoughtful person would, in your own words, following the thread of what they say.
2. Honest claims. What the team receives is an inferred profile, never a score. Never mention scores, scales, or instrument names to the person.
3. No medical advice. If asked "is this normal?", "should I worry?", "what should I do?", acknowledge warmly, say their care team will see the question, and do not answer clinically.
4. Safety. If the person mentions wanting to hurt themselves, being hurt by someone, or being in crisis, respond only with brief, warm acknowledgement; the system detects this separately and takes over.
5. Autonomy. If they skip, decline, or want to stop, honour it at once and never circle back to that topic unprompted.
6. Privacy. Do not ask for names, dates of birth, addresses, or contact details. Refer to the person only by the display name given.
7. Their words matter. Ask in a way that invites them to say things in their own words: what the team sees are their sentences, not your paraphrase.`;

// ---------------------------------------------------------------------------
// Section 2: register profile
// ---------------------------------------------------------------------------

const LANGUAGE_TEXT: Record<Language, string> = {
  en: "Conduct the whole conversation in English.",
  es:
    'Conduct the whole conversation in Spanish (español), including the greeting and any wrap-up. Use neutral, widely understood Spanish. Use "tú" with children and teenagers and "usted" with adults unless they invite informality.',
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
      return `You are talking with the parent or guardian of the patient, ${name}, who is answering on the patient's behalf. Address the guardian as "you" (in Spanish, "usted" — the guardian is an adult even though the patient is a child) and refer to ${name} by name. Ask about what they observe and what ${name} has said or done, and make it clear in your questions which of the two you are asking about.`;
    case "both":
      return `The patient, ${name}, and their guardian are both present and may both type. Address ${name} directly by default and invite the guardian to add what they notice. When it is not obvious who just answered, ask lightly so the record stays clear.`;
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
  screenBrief?: string | null;
}): string {
  const lines = [
    "# Patient context",
    `Display name: ${input.displayName}`,
    `Diagnosis / treatment (as the patient would say it): ${input.diagnosisLabel}`,
    `Timepoint: ${TIMEPOINT_TEXT[input.timepoint] ?? input.timepoint}`,
  ];
  if (input.screenBrief) lines.push("", input.screenBrief);
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
  const facets = facetsOf(c);
  return [
    `- ${c.id}${focus} (${c.priority}) — ${label}`,
    `  what: ${description}`,
    `  severity: none=${s.none} | mild=${s.mild} | moderate=${s.moderate} | severe=${s.severe}`,
    drill.length ? `  drill-down: ${drill.join("; ")}` : null,
    facets.length ? `  details: ${facets.map((f) => `${f.id}=${f.label}`).join("; ")}` : null,
  ].filter((l): l is string => l !== null).join("\n");
}

/** Compact one-construct rendering for the per-turn extraction call: no description or
 * drill-down (the extractor only rates and tags), facets only where they are being explored. */
export function renderConstructForExtraction(
  c: ActiveConstruct,
  population: Population,
  withFacets: boolean,
): string {
  const variant = population === "pediatric" ? c.age_variants?.pediatric : undefined;
  const s = c.severity_signals;
  const facets = withFacets ? facetsOf(c) : [];
  return [
    `- ${c.id} — ${variant?.label ?? c.label}`,
    `  severity: none=${s.none} | mild=${s.mild} | moderate=${s.moderate} | severe=${s.severe}`,
    facets.length ? `  details: ${facets.map((f) => `${f.id}=${f.label}`).join("; ")}` : null,
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

export function renderCoverage(tracker: TrackerState): string {
  const state = tracker.coverage;
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
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// v1.1 §B: phase guidance (dynamic block, right before the budget)
// ---------------------------------------------------------------------------

function facetLabels(construct: ActiveConstruct | undefined, ids: string[]): string[] {
  const byId = new Map(facetsOf(construct ?? { facets: [] }).map((f: Facet) => [f.id, f.label]));
  return ids.map((id) => byId.get(id) ?? id);
}

/**
 * The one instruction that drives the turn: which triage item to ask, or which focus construct
 * to stay on and which of its details are still missing. Wrap-up keeps the §7.2 section-7 text.
 */
export function renderPhaseGuidance(
  tracker: TrackerState,
  active: ActiveConstruct[],
): string {
  const lines = ["# This phase"];
  if (tracker.phase === "triage") {
    lines.push(
      "You are getting the overall picture first. Do not go deep on anything yet; a later phase does that.",
    );
    const next = tracker.triage.next;
    if (next) lines.push(`Ask about: ${next.intent} ${TRIAGE_GUIDANCE_SUFFIX}`);
    else lines.push("The opening screen is answered; follow up on what they just said.");
    if (tracker.triage.items.length) {
      lines.push(
        `Opening screen: ${tracker.triage.answered.length} of ${tracker.triage.items.length} answered.`,
      );
    }
    return lines.join("\n");
  }

  if (tracker.phase === "explore") {
    const current = tracker.current_focus;
    if (!current) {
      lines.push(
        "Every area you needed to go into is closed. Ask if there is anything else on their mind, then begin closing.",
      );
      return lines.join("\n");
    }
    const construct = active.find((c) => c.id === current.construct_id);
    const missing = facetLabels(construct, current.facets_missing);
    lines.push(
      `Current focus: ${current.label}. Still to cover: ${
        missing.length ? missing.join(", ") : "nothing — the list is covered"
      }.`,
    );
    lines.push(EXPLORE_GUIDANCE);
    if (current.ready_to_confirm) {
      lines.push(
        "You have enough on this area: reflect it back in one or two sentences now and ask if that is right. Do not open the next area in the same message.",
      );
    }
    lines.push(
      `Areas closed so far: ${tracker.focus_progress.confirmed} of ${tracker.focus_progress.total}.`,
    );
    return lines.join("\n");
  }

  lines.push(
    "You are closing the conversation. Thank them warmly in one or two sentences, mention that their care team will read this, and do not open anything new.",
  );
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
// Section 8: how to talk + control phrases (v1.1: no tools are sent with this call)
// ---------------------------------------------------------------------------

const CONVERSATION_RULES = `# How to talk
Write one message: warm, in the patient's register, no lists, no headings, no labels. Never mention constructs, ids, phases, records, or the system to the patient.
Ask about one thing at a time and let their answer choose your next question. When they give you something thin ("it's fine, I guess"), ask once more in a gentler, more concrete way before moving on.
When someone asks you a medical question, acknowledge it warmly, say their care team will see it, and carry on; never answer it clinically.

# Control phrases
"Skip", "next", "I'd rather not say", "stop", "take a break" (and their Spanish equivalents) are handled by the system before you see them, but if the patient declines in other words, respect it immediately. Never pressure, never repeat a declined topic.

# Style
Sound like a person, not a form: react to what they said before asking anything. Keep every reply to two to four short sentences (under about 70 words): one brief reaction, then one question. Open with a short, friendly greeting on the first turn and one easy, open question about how things are for them at the moment. Keep to one topic per message.`;

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
  /** Rendered numeric-screen block (see screen.ts), or null when no screen was submitted. */
  screenBrief?: string | null;
  clinicianNote: { note: string; focus_constructs: string[] } | null;
  population: Population;
  activeConstructs: ActiveConstruct[];
  tracker: TrackerState;
  budget: TurnBudget;
  /** Per-turn instructions injected by the handler (e.g. deterministic skip handling). */
  turnNotes?: string[];
}

export interface SystemPromptBlocks {
  /** Identical for every turn of a session: eligible for prompt caching. */
  stable: string;
  /** Changes every turn (coverage, budget, per-turn notes); always last so the cached prefix holds. */
  dynamic: string;
}

const joinSections = (sections: (string | null)[]) =>
  sections.filter((s): s is string => s !== null).join("\n\n");

export function buildSystemPromptBlocks(input: SystemPromptInput): SystemPromptBlocks {
  const stable = joinSections([
    ROLE_AND_PRINCIPLES,
    renderRegisterProfile(input),
    renderPatientContext(input),
    renderClinicianNote(input.clinicianNote),
    renderConstructMap(input.activeConstructs, input.population),
    CONVERSATION_RULES,
  ]);
  const dynamic = joinSections([
    renderPhaseGuidance(input.tracker, input.activeConstructs),
    renderCoverage(input.tracker),
    renderTurnBudget(input.budget),
    input.turnNotes && input.turnNotes.length
      ? ["# This turn", ...input.turnNotes.map((n) => `- ${n}`)].join("\n")
      : null,
  ]);
  return { stable, dynamic };
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const { stable, dynamic } = buildSystemPromptBlocks(input);
  return `${stable}\n\n${dynamic}`;
}

// ---------------------------------------------------------------------------
// v1.1 §C: extraction prompt (one non-streaming JSON call after the reply)
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

export interface ExtractionPromptInput {
  /** The assistant message the patient was answering (null on the first patient message). */
  lastAssistantMessage: string | null;
  patientMessage: string;
  activeConstructs: ActiveConstruct[];
  population: Population;
  triage: TriageItem[];
  language: Language;
  /** Constructs whose facets to list; null/undefined lists facets for every construct. */
  facetsFor?: Set<string> | null;
}

const EXTRACTION_SHAPE = {
  evidence: [{
    construct_id: "id from the list",
    patient_quote: "verbatim substring of the patient message",
    quote_gloss_en: "English gloss (same text when the message is already English)",
    severity: "none|mild|moderate|severe|unclear|declined",
    confidence: 0.0,
    interference: ["social"],
    facets: ["facet id from that construct"],
    triage_item: "triage item id or null",
    note: "short rationale or null",
  }],
  findings: [{ construct_id: "id", category: "impact", finding: "one sentence, English" }],
  declined: ["construct id the patient refused or deflected"],
  triage_answered: ["triage item id this message answered"],
  confirmed: ["construct id the patient just confirmed when it was reflected back"],
  patient_questions: ["a medical question the patient asked, verbatim"],
};

/**
 * Reads one patient message against the question it answered and files it. This is the only
 * place evidence is created during a session, so its rules are strict: quotes must be real
 * substrings, ids must come from the list, and nothing may be inferred beyond what was said.
 */
export function buildExtractionPrompt(
  input: ExtractionPromptInput,
): { system: string; user: string } {
  const system = [
    "You file what a patient said in a conversation about how their face looks and works, for a clinical team. You never talk to the patient and you never invent anything.",
    "Rules:",
    "1. patient_quote MUST be a verbatim substring of the patient message, copied character for character, in the patient's own language. Never paraphrase, never merge two parts of the message, never quote the assistant. Drop any item you cannot quote this way.",
    "2. Use only construct ids from the list below, and only facet ids belonging to that construct. Drop anything you cannot map.",
    '3. severity follows the construct\'s own signals. Use "unclear" when something was said but cannot be rated, and "none" when they say that area is fine. Put a construct in `declined` (not in evidence) when they skip it, deflect, or say they would rather not.',
    "4. confidence 0–1 is how directly their words support the rating. Be conservative: hedged or second-hand statements are below 0.6.",
    "5. `facets` lists the details of that construct the quote actually speaks to; an empty list is fine.",
    "6. `triage_item` / `triage_answered` are set when the message answers one of the opening-screen items below.",
    '7. `confirmed` lists constructs the patient just agreed with when the assistant reflected an area back to them ("yes, that\'s right"). Never guess this.',
    "8. `findings` are short qualitative notes (onset, trajectory, triggers, relief, impact, expectation); medical questions go in `patient_questions` as well as a `patient_question` finding.",
    "9. When the conversation language is English, omit quote_gloss_en entirely. Omit note unless it adds something the quote does not say.",
    "10. Say nothing else. Output ONLY the JSON object, no prose, no code fences. Every array may be empty.",
    "",
    "Shape:",
    JSON.stringify(EXTRACTION_SHAPE, null, 2),
    `severity ∈ ${SEVERITIES.join("|")}|declined. interference ⊆ ${INTERFERENCE.join(", ")}.`,
    `finding category ∈ ${CATEGORIES.join("|")}.`,
  ].join("\n");

  const triage = input.triage.length
    ? input.triage.map((t) => `- ${t.id}: ${t.intent}`).join("\n")
    : "(none)";
  const user = [
    `Conversation language: ${input.language}.`,
    "",
    "Constructs (id, severity signals, details where listed):",
    ...input.activeConstructs.map((c) =>
      renderConstructForExtraction(
        c,
        input.population,
        !input.facetsFor || input.facetsFor.has(c.id),
      )
    ),
    "",
    "Opening-screen items:",
    triage,
    "",
    `Assistant asked: ${input.lastAssistantMessage ?? "(nothing yet — this is the first message)"}`,
    `Patient replied: ${input.patientMessage}`,
  ].join("\n");
  return { system, user };
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
// v1.1 §E Ingestion: merge a pasted instrument into the approved map
// ---------------------------------------------------------------------------

export interface IngestMergePromptInput {
  instrumentSlug: string;
  population: Population;
  /** The approved map being merged into: ids, labels and the facets already present. */
  currentMap: ConstructMap;
  text: string;
}

function renderMapForMerge(map: ConstructMap): string {
  const lines: string[] = [];
  for (const d of map.domains) {
    lines.push(`## ${d.id}: ${d.label}`);
    for (const c of d.constructs) {
      const facets = facetsOf(c).map((f) => f.id).join(", ") || "(none yet)";
      lines.push(`- ${c.id} — ${c.label}: ${c.description}`);
      lines.push(`  facets: ${facets}`);
    }
  }
  const triage = (map.triage ?? []).map((t) => `- ${t.id}: ${t.intent}`).join("\n");
  lines.push("## opening screen", triage || "- (none yet)");
  return lines.join("\n");
}

/**
 * §E: the model proposes additions only — new facets for constructs that already exist, new
 * constructs where nothing in the map covers an item, and new opening-screen intents. The
 * handler merges and rejects anything that copies the source wording.
 */
export function buildIngestMergePrompt(
  input: IngestMergePromptInput,
): { system: string; user: string } {
  const system = [
    "You extend an existing construct map with what a patient-reported outcome instrument measures. A construct map describes WHAT an instrument asks about, never HOW it asks.",
    "HARD RULE: never copy, quote, lightly reword, or list item text. The source is licensed. Every label, description and facet must be your own paraphrased abstraction at the level of the scale, not the item. Anything that reuses a run of the source wording is rejected and thrown away.",
    "Propose ADDITIONS ONLY. Never restate, rename or remove anything already in the map.",
    "1. facets: for constructs already in the map, the clinician-relevant details an interviewer should cover, as {id, label}. Short ids in snake_case; 5–8 facets per construct in total including the ones already there, so add only what is missing.",
    "2. new_constructs: only where nothing in the map covers what the instrument measures. Full §6 construct objects including facets, and each one names the domain it belongs to.",
    "3. triage: suggested opening-screen intents ({id, intent, maps_to}); intent is what to find out, in the interviewer's own words, never a question to read out.",
    "Output ONLY a JSON object in this exact shape (no prose, no code fences):",
    JSON.stringify(
      {
        facets: { "existing.construct_id": [{ id: "facet_id", label: "Short paraphrased label" }] },
        new_constructs: [{
          domain_id: "existing or new domain id",
          domain_label: "Domain label (only needed for a new domain)",
          id: "domain_id.construct_id",
          label: "Short paraphrased label",
          description: "What this construct captures, paraphrased.",
          severity_signals: { none: "...", mild: "...", moderate: "...", severe: "..." },
          drill_down: ["cue"],
          facets: [{ id: "facet_id", label: "Short paraphrased label" }],
          priority: "core | standard | optional",
          source_refs: [{ instrument: "<instrument-slug>", scale: "<scale name only>" }],
        }],
        triage: [{ id: "item_id", intent: "What to find out", maps_to: ["construct.id"] }],
      },
      null,
      2,
    ),
    "Any of the three may be empty. source_refs reference scale names only.",
  ].join("\n");
  const user = [
    `Instrument slug: ${input.instrumentSlug}. Population: ${input.population}.`,
    "",
    "Current approved map:",
    renderMapForMerge(input.currentMap),
    "",
    "Instrument text (for understanding only; do not reproduce any of it):",
    "<<<",
    input.text,
    ">>>",
  ].join("\n");
  return { system, user };
}
