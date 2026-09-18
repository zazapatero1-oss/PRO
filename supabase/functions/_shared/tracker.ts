// Deterministic coverage tracker (SPEC §7.1) plus the v1.1 §B phase/focus machine.
// Pure functions; no I/O. Nothing here trusts the model: every state is derived from rows.

import type {
  ActiveConstruct,
  ConstructCoverage,
  ConstructEvidenceRow,
  ConstructMap,
  CoverageState,
  CoverageStatus,
  EndReason,
  Facet,
  FocusConstructState,
  ProbeFindingRow,
  RankedSeverity,
  SessionPhase,
  SessionRow,
  Severity,
  Timepoint,
  TrackerState,
  TriageItem,
  TriageState,
} from "./types.ts";

export const SEVERITY_RANK: Record<RankedSeverity, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
};

export function isRanked(s: Severity): s is RankedSeverity {
  return s in SEVERITY_RANK;
}

export function severityRank(s: Severity): number | null {
  return isRanked(s) ? SEVERITY_RANK[s] : null;
}

const PRIORITY_ORDER: Record<ActiveConstruct["priority"], number> = {
  core: 0,
  standard: 1,
  optional: 2,
};

export function flattenConstructs(map: ConstructMap): ActiveConstruct[] {
  const out: ActiveConstruct[] = [];
  for (const d of map.domains) {
    for (const c of d.constructs) {
      out.push({ ...c, domain_id: d.id, domain_label: d.label, focus: false });
    }
  }
  return out;
}

/**
 * Chooses the constructs active for a session (SPEC §6: diagnosis `focus_constructs` narrow
 * the map; clinician focus is added on top). Under the cap, admission order is clinician focus
 * → core → standard → optional, in map order within each group. Constructs that declare
 * `applicable_timepoints` are only admitted when the session timepoint matches. When the
 * diagnosis has no focus list, the whole map is the candidate set.
 */
export function selectActiveConstructs(
  map: ConstructMap,
  diagnosisFocus: readonly string[],
  clinicianFocus: readonly string[],
  timepoint: Timepoint | null,
  maxConstructs = map.coverage_rules?.max_constructs_per_session ?? 18,
): ActiveConstruct[] {
  const all = flattenConstructs(map).filter((c) =>
    !c.applicable_timepoints || timepoint === null || c.applicable_timepoints.includes(timepoint)
  );
  const byId = new Map(all.map((c) => [c.id, c]));
  const clinicianSet = new Set(clinicianFocus.filter((id) => byId.has(id)));
  const diagnosisSet = new Set(diagnosisFocus.filter((id) => byId.has(id)));
  const candidates = diagnosisSet.size > 0
    ? all.filter((c) => diagnosisSet.has(c.id) || clinicianSet.has(c.id))
    : all;

  const chosen: ActiveConstruct[] = [];
  const seen = new Set<string>();
  const admit = (c: ActiveConstruct | undefined) => {
    if (!c || seen.has(c.id) || chosen.length >= maxConstructs) return;
    seen.add(c.id);
    chosen.push({ ...c, focus: clinicianSet.has(c.id) });
  };

  for (const id of clinicianFocus) admit(byId.get(id));
  for (const prio of ["core", "standard", "optional"] as const) {
    for (const c of candidates) if (c.priority === prio) admit(c);
  }

  // Present FOCUS first, then map order, so the prompt and UI read consistently.
  const mapIndex = new Map(all.map((c, i) => [c.id, i]));
  return chosen.sort((a, b) => {
    if (a.focus !== b.focus) return a.focus ? -1 : 1;
    return (mapIndex.get(a.id) ?? 0) - (mapIndex.get(b.id) ?? 0);
  });
}

interface ConstructInputs {
  evidence: ConstructEvidenceRow[];
  findings: ProbeFindingRow[];
}

function statusFor(
  { evidence, findings }: ConstructInputs,
  minConfidence: number,
  drillThreshold: RankedSeverity,
): Pick<ConstructCoverage, "status" | "severity" | "confidence"> {
  const live = evidence.filter((e) => e.superseded_by === null);

  if (live.some((e) => e.severity === "declined")) {
    return { status: "declined", severity: "declined", confidence: null };
  }
  if (live.length === 0) {
    return findings.length > 0
      ? { status: "partial", severity: null, confidence: null }
      : { status: "untouched", severity: null, confidence: null };
  }

  const counting = live.filter((e) => e.confidence >= minConfidence && e.severity !== "unclear");
  if (counting.length === 0) {
    const allBelowThreshold = live.every((e) => e.confidence < minConfidence);
    if (allBelowThreshold) {
      return { status: "needs_clarification", severity: null, confidence: null };
    }
    // Confident but "unclear": something was heard, nothing can be rated yet.
    return { status: "partial", severity: "unclear", confidence: null };
  }

  const ranks = counting.map((e) => severityRank(e.severity)).filter((r): r is number =>
    r !== null
  );
  const conflict = ranks.length >= 2 && Math.max(...ranks) - Math.min(...ranks) >= 2;
  // Most recent counting row is the current view; corrections supersede older rows anyway.
  const latest = counting[counting.length - 1];
  if (conflict) {
    return {
      status: "needs_clarification",
      severity: latest.severity,
      confidence: latest.confidence,
    };
  }

  const rank = severityRank(latest.severity);
  if (rank !== null && rank >= SEVERITY_RANK[drillThreshold]) {
    return {
      status: findings.length >= 2 ? "drill_down_done" : "drill_down_pending",
      severity: latest.severity,
      confidence: latest.confidence,
    };
  }
  return { status: "covered", severity: latest.severity, confidence: latest.confidence };
}

const TERMINAL: ReadonlySet<CoverageStatus> = new Set(["covered", "declined", "drill_down_done"]);

export function computeCoverage(
  map: ConstructMap,
  active: ActiveConstruct[],
  evidence: ConstructEvidenceRow[],
  findings: ProbeFindingRow[],
): CoverageState {
  const rules = map.coverage_rules ?? {
    min_confidence_to_count: 0.6,
    drill_down_threshold: "moderate",
    core_constructs_required: true,
    max_constructs_per_session: 18,
  };
  const constructs: ConstructCoverage[] = active.map((c) => {
    const ev = evidence.filter((e) => e.construct_id === c.id);
    const fi = findings.filter((f) => f.construct_id === c.id);
    const s = statusFor(
      { evidence: ev, findings: fi },
      rules.min_confidence_to_count,
      rules.drill_down_threshold,
    );
    return {
      construct_id: c.id,
      label: c.label,
      domain_id: c.domain_id,
      priority: c.priority,
      focus: c.focus,
      status: s.status,
      severity: s.severity,
      confidence: s.confidence,
      evidence_count: ev.filter((e) => e.superseded_by === null).length,
      finding_count: fi.length,
    };
  });
  const covered =
    constructs.filter((c) =>
      c.status === "covered" || c.status === "drill_down_pending" || c.status === "drill_down_done"
    ).length;
  const state: CoverageState = {
    constructs,
    covered,
    total_active: constructs.length,
    complete: false,
  };
  state.complete = isConstructCoverageComplete(state, rules.core_constructs_required);
  return state;
}

/**
 * Complete when nothing is left to open or deepen. `needs_clarification` does not block
 * completion (it becomes a clinician item), but core constructs must have reached a
 * terminal status when the map requires them. v1.1 keeps this as a per-construct measure;
 * whether the *session* is done is `isCoverageComplete` below (focus + triage).
 */
export function isConstructCoverageComplete(state: CoverageState, coreRequired = true): boolean {
  if (state.constructs.length === 0) return false;
  for (const c of state.constructs) {
    if (c.status === "untouched" || c.status === "partial" || c.status === "drill_down_pending") {
      return false;
    }
    if (coreRequired && c.priority === "core" && !TERMINAL.has(c.status)) return false;
  }
  return true;
}

/** Priority ordering used both in the prompt and for the deterministic skip fallback. */
export function prioritisedOpen(state: CoverageState): ConstructCoverage[] {
  const bucket = (c: ConstructCoverage): number => {
    if (TERMINAL.has(c.status)) return 99;
    if (c.focus) return 0;
    if (c.status === "needs_clarification") return 1;
    if (c.status === "drill_down_pending") return 2;
    if (c.status === "untouched" || c.status === "partial") {
      return 3 + PRIORITY_ORDER[c.priority];
    }
    return 50;
  };
  return state.constructs
    .map((c, i) => ({ c, i, b: bucket(c) }))
    .filter((x) => x.b < 99)
    .sort((a, b) => a.b - b.b || a.i - b.i)
    .map((x) => x.c);
}

// ---------------------------------------------------------------------------
// v1.1 §B: triage → explore → wrap-up
// ---------------------------------------------------------------------------

/** A focus construct counts as explored in depth at this share of its facets (map may override). */
export const DEFAULT_FOCUS_FACET_THRESHOLD = 0.7;
/** §B: at most eight constructs are explored in depth. */
export const MAX_FOCUS_CONSTRUCTS = 8;
/** §B: triage ends after this many assistant turns even if items are still unanswered. */
export const MAX_TRIAGE_TURNS = 6;

/**
 * How a confirmation is stored. The schema has no boolean for it, and `construct_evidence` rows
 * must stay patient quotes, so the reflect-back step is recorded as a `probe_findings` row with
 * category "other" (the only free category in the check constraint) whose text starts with
 * "confirmed:". `isConfirmation` is the single reader of that convention.
 */
export const CONFIRMATION_PREFIX = "confirmed:";

export function confirmationText(reflection: string): string {
  return `${CONFIRMATION_PREFIX} ${reflection.trim()}`.trim();
}

export function isConfirmation(f: Pick<ProbeFindingRow, "category" | "finding">): boolean {
  return f.category === "other" &&
    f.finding.trim().toLowerCase().startsWith(CONFIRMATION_PREFIX);
}

export function facetsOf(c: { facets?: Facet[] }): Facet[] {
  return c.facets ?? [];
}

function focusFacetThreshold(map: ConstructMap): number {
  const v = map.coverage_rules?.focus_facet_threshold;
  return typeof v === "number" && v > 0 && v <= 1 ? v : DEFAULT_FOCUS_FACET_THRESHOLD;
}

const live = (evidence: ConstructEvidenceRow[], constructId: string) =>
  evidence.filter((e) => e.construct_id === constructId && e.superseded_by === null);

/**
 * Triage progress (§B). An item is answered once any evidence row carries its id; items that
 * declare `timepoints` only apply at those timepoints (e.g. recovery questions post-op).
 */
export function triageState(
  map: ConstructMap,
  session: Pick<SessionRow, "timepoint">,
  evidence: ConstructEvidenceRow[],
): TriageState {
  const items: TriageItem[] = (map.triage ?? []).filter((i) =>
    !i.timepoints || i.timepoints.includes(session.timepoint)
  );
  const seen = new Set(
    evidence.map((e) => e.triage_item).filter((id): id is string => typeof id === "string" && !!id),
  );
  const answered = items.filter((i) => seen.has(i.id)).map((i) => i.id);
  const next = items.find((i) => !seen.has(i.id)) ?? null;
  return { items, answered, next, done: next === null };
}

/**
 * §B focus derivation: everything the patient gave a signal about, plus clinician focus, capped
 * at 8. Order: clinician focus → severity desc → core first → map order. Declined constructs are
 * never focus (the patient already closed that door). "Named during triage" means an evidence row
 * that answered a triage item and was not a decline or an explicit "none".
 */
export function deriveFocus(
  active: ActiveConstruct[],
  evidence: ConstructEvidenceRow[],
  diagnosisFocus: readonly string[] = [],
  max = MAX_FOCUS_CONSTRUCTS,
): string[] {
  const diagnosisSet = new Set(diagnosisFocus);
  const scored: {
    id: string;
    clinician: boolean;
    named: boolean;
    overall: boolean;
    rank: number;
    priority: number;
    order: number;
  }[] = [];

  active.forEach((c, order) => {
    const rows = live(evidence, c.id);
    if (rows.some((e) => e.severity === "declined")) return;
    const ranks = rows.map((e) => severityRank(e.severity)).filter((r): r is number => r !== null);
    const best = ranks.length ? Math.max(...ranks) : -1;
    const namedInTriage = rows.some((e) =>
      !!e.triage_item && e.severity !== "declined" && e.severity !== "none"
    );
    const qualifies = c.focus ||
      best >= SEVERITY_RANK.mild ||
      namedInTriage ||
      (diagnosisSet.has(c.id) && best >= SEVERITY_RANK.mild);
    if (!qualifies) return;
    scored.push({
      id: c.id,
      clinician: c.focus,
      named: namedInTriage,
      overall: c.id.endsWith(".overall"),
      rank: best,
      priority: PRIORITY_ORDER[c.priority],
      order,
    });
  });

  return scored
    .sort((a, b) =>
      Number(b.clinician) - Number(a.clinician) ||
      b.rank - a.rank ||
      // At equal severity, what the patient brought up themselves comes first.
      Number(b.named) - Number(a.named) ||
      // A summary construct ("overall") mostly repeats the triage answers; specific features first.
      Number(a.overall) - Number(b.overall) ||
      a.priority - b.priority ||
      a.order - b.order
    )
    .slice(0, max)
    .map((x) => x.id);
}

/** Per focus construct: how much of its facet list has been heard, and whether it is closed. */
export function focusState(
  map: ConstructMap,
  construct: ActiveConstruct,
  evidence: ConstructEvidenceRow[],
  findings: ProbeFindingRow[],
): FocusConstructState {
  const rows = live(evidence, construct.id);
  const facets = facetsOf(construct);
  const declared = facets.map((f) => f.id);
  const heard = new Set<string>();
  for (const row of rows) {
    if (row.severity === "declined") continue;
    for (const f of row.facets ?? []) if (declared.includes(f)) heard.add(f);
  }
  const covered = declared.filter((id) => heard.has(id));
  const missing = declared.filter((id) => !heard.has(id));
  const rated = rows.filter((e) => e.severity !== "declined");
  const ready = declared.length === 0
    ? rated.length > 0
    : covered.length / declared.length >= focusFacetThreshold(map);

  const declined = rows.some((e) => e.severity === "declined");
  const confirmed = findings.some((f) => f.construct_id === construct.id && isConfirmation(f));
  const status = declined
    ? "declined"
    : confirmed
    ? "confirmed"
    : rows.length > 0
    ? "in_progress"
    : "untouched";

  return {
    construct_id: construct.id,
    label: construct.label,
    status,
    facets_total: declared.length,
    facets_covered: covered,
    facets_missing: missing,
    ready_to_confirm: ready,
  };
}

/** The construct the model must stay on: the first focus construct that is not closed. */
export function currentFocus(focus: FocusConstructState[]): FocusConstructState | null {
  return focus.find((f) => f.status !== "confirmed" && f.status !== "declined") ?? null;
}

/**
 * §B: the session's work is done when triage is answered and every focus construct has been
 * confirmed back to the patient or declined. Light (non-focus) constructs never block.
 */
export function isCoverageComplete(
  triage: TriageState,
  focus: FocusConstructState[],
): boolean {
  if (!triage.done) return false;
  return focus.every((f) => f.status === "confirmed" || f.status === "declined");
}

export interface TrackerInput {
  map: ConstructMap;
  session: Pick<SessionRow, "timepoint" | "phase" | "focus_constructs">;
  active: ActiveConstruct[];
  evidence: ConstructEvidenceRow[];
  findings: ProbeFindingRow[];
  diagnosisFocus?: readonly string[];
  /** Assistant messages so far; triage gives up after MAX_TRIAGE_TURNS. */
  assistantTurns: number;
  /** max(turns/max_turns, minutes/target_minutes); ≥1 forces the goodbye turn. */
  budgetFraction?: number;
}

/**
 * The transition function: given the rows, decide the phase, the focus list and whether this
 * turn is the last one. `end_reason` non-null ⟺ phase "wrap-up": the prompt tells the model to
 * close and the handler emits `ended` after the reply.
 */
export function computeTrackerState(input: TrackerInput): TrackerState {
  const { map, session, active, evidence, findings } = input;
  const coverage = computeCoverage(map, active, evidence, findings);
  const triage = triageState(map, session, evidence);

  let phase: SessionPhase = session.phase ?? "triage";
  if (phase === "triage" && (triage.done || input.assistantTurns >= MAX_TRIAGE_TURNS)) {
    phase = "explore";
  }

  // Derived once, when triage ends, then kept stable so the conversation does not wander.
  let focusIds = (session.focus_constructs ?? []).filter((id) => active.some((c) => c.id === id));
  if (phase !== "triage" && focusIds.length === 0) {
    focusIds = deriveFocus(active, evidence, input.diagnosisFocus ?? []);
  }
  const focus = focusIds
    .map((id) => active.find((c) => c.id === id))
    .filter((c): c is ActiveConstruct => c !== undefined)
    .map((c) => focusState(map, c, evidence, findings));

  // Nothing heard at all: never end a conversation that has not happened yet.
  const complete = evidence.length > 0 && phase !== "triage" && isCoverageComplete(triage, focus);
  let endReason: EndReason | null = null;
  if ((input.budgetFraction ?? 0) >= 1) endReason = "turn_budget";
  else if (complete) endReason = "coverage_complete";
  if (endReason) phase = "wrap-up";

  return {
    phase,
    triage,
    focus,
    focus_constructs: focusIds,
    current_focus: phase === "explore" ? currentFocus(focus) : null,
    focus_progress: {
      confirmed: focus.filter((f) => f.status === "confirmed" || f.status === "declined").length,
      total: focus.length,
    },
    coverage,
    complete,
    end_reason: endReason,
  };
}
