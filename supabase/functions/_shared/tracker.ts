// Deterministic coverage tracker (SPEC §7.1). Pure functions; no I/O.

import type {
  ActiveConstruct,
  ConstructCoverage,
  ConstructEvidenceRow,
  ConstructMap,
  CoverageState,
  CoverageStatus,
  ProbeFindingRow,
  RankedSeverity,
  Severity,
  Timepoint,
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
  state.complete = isCoverageComplete(state, rules.core_constructs_required);
  return state;
}

/**
 * Complete when nothing is left to open or deepen. `needs_clarification` does not block
 * completion (it becomes a clinician item), but core constructs must have reached a
 * terminal status when the map requires them.
 */
export function isCoverageComplete(state: CoverageState, coreRequired = true): boolean {
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
