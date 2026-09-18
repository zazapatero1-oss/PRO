// Profile generation (SPEC §8). Severities and structure are computed deterministically from
// evidence; the model contributes domain summaries, clarification reasons and change notes.
// Shared by end-session and confirm-summary (regeneration after corrections).

import type {
  ActiveConstruct,
  AnthropicClientLike,
  ConstructEvidenceRow,
  CoverageState,
  Language,
  ProbeFindingRow,
  ProfileChange,
  ProfileConstruct,
  ProfileDomain,
  ProfileJson,
  RankedSeverity,
  Severity,
  Timepoint,
} from "./types.ts";
import { PROFILE_DISCLAIMER } from "./types.ts";
import { isRanked, SEVERITY_RANK, severityRank } from "./tracker.ts";
import { buildProfilePrompt } from "./prompt.ts";
import { completeJson, type Usage } from "./anthropic.ts";
import { MAX_JSON_OUTPUT_TOKENS } from "./config.ts";

const RANK_TO_SEVERITY: RankedSeverity[] = ["none", "mild", "moderate", "severe"];

/**
 * SPEC §8: worst covered construct severity, unless ≥2 constructs; then the median with the
 * worst noted. Upper median on even counts so the domain leans cautious.
 */
export function domainSeverity(
  constructs: { severity: Severity; confidence: number }[],
): { severity: Severity; confidence: number; worst?: Severity } {
  const rated = constructs.filter((c) => isRanked(c.severity));
  if (rated.length === 0) return { severity: "unclear", confidence: 0 };
  const ranks = rated.map((c) => severityRank(c.severity) as number).sort((a, b) => a - b);
  const worstRank = ranks[ranks.length - 1];
  const confidence = Math.round(
    (rated.reduce((s, c) => s + c.confidence, 0) / rated.length) * 100,
  ) / 100;
  if (rated.length === 1) return { severity: RANK_TO_SEVERITY[worstRank], confidence };
  const medianRank = ranks[Math.floor(ranks.length / 2)];
  return {
    severity: RANK_TO_SEVERITY[medianRank],
    confidence,
    worst: RANK_TO_SEVERITY[worstRank],
  };
}

export interface ProfileBuildInput {
  activeConstructs: ActiveConstruct[];
  coverage: CoverageState;
  evidence: ConstructEvidenceRow[];
  findings: ProbeFindingRow[];
  language: Language;
  timepoint: Timepoint;
  priorProfile: ProfileJson | null;
  generatedWith: { model: string; prompt_version: string; map: string };
}

/** Everything that does not need a model call. */
export function buildDeterministicProfile(input: ProfileBuildInput): ProfileJson {
  const domainsById = new Map<string, ProfileDomain>();
  const needs: ProfileJson["needs_clarification"] = [];
  const notCovered: string[] = [];
  const declined: string[] = [];
  const questions: string[] = [];

  for (const c of input.activeConstructs) {
    const cov = input.coverage.constructs.find((x) => x.construct_id === c.id);
    const status = cov?.status ?? "untouched";
    const live = input.evidence.filter((e) => e.construct_id === c.id && !e.superseded_by);
    const findings = input.findings.filter((f) => f.construct_id === c.id);

    for (const f of findings) if (f.category === "patient_question") questions.push(f.finding);

    const construct: ProfileConstruct = {
      id: c.id,
      label: c.label,
      severity: cov?.severity ?? (status === "declined" ? "declined" : "unclear"),
      confidence: cov?.confidence ?? 0,
      quotes: live
        .filter((e) => e.severity !== "declined" && e.patient_quote)
        .map((e) => ({ text: e.patient_quote, lang: input.language, gloss_en: e.quote_gloss_en })),
      findings: findings.map((f) => ({ category: f.category, text: f.finding })),
      status,
    };

    if (status === "declined") declined.push(c.id);
    else if (status === "untouched" || status === "partial") notCovered.push(c.id);
    else if (status === "needs_clarification") {
      needs.push({ construct_id: c.id, reason: clarificationReason(live) });
    }

    const domain = domainsById.get(c.domain_id) ?? {
      id: c.domain_id,
      label: c.domain_label,
      severity: "unclear",
      confidence: 0,
      summary_en: "",
      constructs: [],
    };
    domain.constructs.push(construct);
    domainsById.set(c.domain_id, domain);
  }

  const domains = [...domainsById.values()].map((d) => {
    const rated = d.constructs.filter((c) =>
      c.status === "covered" || c.status === "drill_down_pending" || c.status === "drill_down_done"
    );
    const ds = domainSeverity(rated);
    return {
      ...d,
      severity: ds.severity,
      confidence: ds.confidence,
      ...(ds.worst ? { worst_severity: ds.worst } : {}),
      summary_en: defaultDomainSummary(d, rated.length, ds),
    };
  });

  return {
    generated_with: input.generatedWith,
    domains,
    needs_clarification: needs,
    not_covered: notCovered,
    declined,
    patient_questions: questions,
    change_from_prior: computeChange(domains, input.priorProfile),
    disclaimer: PROFILE_DISCLAIMER,
  };
}

function clarificationReason(live: ConstructEvidenceRow[]): string {
  const ranks = live.map((e) => severityRank(e.severity)).filter((r): r is number => r !== null);
  if (ranks.length >= 2 && Math.max(...ranks) - Math.min(...ranks) >= 2) {
    return "Conflicting severities recorded across the conversation.";
  }
  return "Evidence recorded with low confidence only.";
}

function defaultDomainSummary(
  d: ProfileDomain,
  ratedCount: number,
  ds: { severity: Severity; worst?: Severity },
): string {
  if (ratedCount === 0) return `${d.label}: not enough was discussed to rate this area.`;
  const worst = ds.worst && ds.worst !== ds.severity ? ` (worst construct: ${ds.worst})` : "";
  return `${d.label}: ${ds.severity}${worst} across ${ratedCount} rated construct${
    ratedCount === 1 ? "" : "s"
  }.`;
}

export function computeChange(
  domains: ProfileDomain[],
  prior: ProfileJson | null,
): ProfileChange[] {
  if (!prior) return [];
  const priorById = new Map<string, Severity>();
  for (const d of prior.domains) for (const c of d.constructs) priorById.set(c.id, c.severity);
  const out: ProfileChange[] = [];
  for (const d of domains) {
    for (const c of d.constructs) {
      const p = priorById.get(c.id);
      if (!p || !isRanked(p) || !isRanked(c.severity) || p === c.severity) continue;
      const direction = SEVERITY_RANK[c.severity] < SEVERITY_RANK[p] ? "improved" : "worsened";
      out.push({
        construct_id: c.id,
        prior: p,
        now: c.severity,
        note: `${direction} since prior session`,
      });
    }
  }
  return out;
}

interface NarrativeJson {
  domains?: { id?: string; summary_en?: string }[];
  needs_clarification?: { construct_id?: string; reason?: string }[];
  change_notes?: { construct_id?: string; note?: string }[];
}

function asNarrative(v: unknown): NarrativeJson {
  if (!v || typeof v !== "object") throw new Error("narrative must be an object");
  return v as NarrativeJson;
}

/** Deterministic profile + one model call for the narrative; falls back cleanly on failure. */
export async function generateProfile(
  input: ProfileBuildInput,
  model: { client: AnthropicClientLike; model: string },
): Promise<{ profile: ProfileJson; usage: Usage; narrativeOk: boolean }> {
  const profile = buildDeterministicProfile(input);
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  const { system, user } = buildProfilePrompt({
    activeConstructs: input.activeConstructs,
    coverage: input.coverage,
    evidence: input.evidence,
    findings: input.findings,
    language: input.language,
    timepoint: input.timepoint,
    priorProfile: input.priorProfile,
  });
  try {
    const res = await completeJson<NarrativeJson>({
      client: model.client,
      model: model.model,
      system,
      user,
      maxTokens: MAX_JSON_OUTPUT_TOKENS,
      validate: asNarrative,
    });
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    for (const d of res.value.domains ?? []) {
      const target = profile.domains.find((x) => x.id === d.id);
      if (target && typeof d.summary_en === "string" && d.summary_en.trim()) {
        target.summary_en = d.summary_en.trim();
      }
    }
    for (const n of res.value.needs_clarification ?? []) {
      const target = profile.needs_clarification.find((x) => x.construct_id === n.construct_id);
      if (target && typeof n.reason === "string" && n.reason.trim()) {
        target.reason = n.reason.trim();
      }
    }
    for (const c of res.value.change_notes ?? []) {
      const target = profile.change_from_prior.find((x) => x.construct_id === c.construct_id);
      if (target && typeof c.note === "string" && c.note.trim()) target.note = c.note.trim();
    }
    return { profile, usage, narrativeOk: true };
  } catch (err) {
    console.error("profile narrative generation failed; using deterministic summaries", err);
    return { profile, usage, narrativeOk: false };
  }
}

/** Used when the patient-summary model call fails: still honest, still in-language. */
export function fallbackPatientSummary(profile: ProfileJson, language: Language): string {
  const heard = profile.domains.filter((d) => d.constructs.some((c) => c.quotes.length > 0));
  const lines = language === "es" ? ["Esto es lo que escuché:"] : ["Here is what I heard:"];
  for (const d of heard) {
    const q = d.constructs.flatMap((c) => c.quotes).slice(0, 1).map((q) => `"${q.text}"`).join("");
    lines.push(`- ${d.label}${q ? `: ${q}` : ""}`);
  }
  lines.push(
    language === "es"
      ? "¿Lo entendí bien? Puede corregir cualquier cosa."
      : "Did I get this right? You can correct anything.",
  );
  return lines.join("\n");
}
