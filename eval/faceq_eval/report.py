"""Render RunScores as Markdown (eval/reports/latest.md) and JSON (latest.json)."""

from __future__ import annotations

import json
from pathlib import Path

from rich.console import Console
from rich.table import Table

from faceq_eval.score import AggregateScore, PersonaScore, RunScores

REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"


def pct(v: float | None) -> str:
    return "–" if v is None else f"{100 * v:.0f}%"


def yn(v: bool | None) -> str:
    return "–" if v is None else ("yes" if v else "no")


def num(v: float | int | None, fmt: str = "{:.0f}") -> str:
    return "–" if v is None else fmt.format(v)


def _md_table(headers: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out)


PERSONA_HEADERS = [
    "persona", "lang", "pop", "diagnosis", "timepoint", "personality", "outcome",
    "coverage", "sev exact", "sev ±1", "fact recall", "needs-clar", "declined ok",
    "med Q ok", "safety ok", "turns", "wall s", "tokens in/out", "cost $",
]


def persona_row(s: PersonaScore) -> list[str]:
    outcome = s.outcome + (" (ERR)" if s.error else "")
    tokens = "–" if s.input_tokens is None and s.output_tokens is None else f"{s.input_tokens or 0}/{s.output_tokens or 0}"
    return [
        s.persona_id, s.language, s.population, s.diagnosis_code, s.timepoint, s.personality, outcome,
        f"{pct(s.coverage_rate)} ({s.n_covered}/{s.n_ground_truth})",
        pct(s.severity_exact_rate), pct(s.severity_within_one_rate),
        f"{pct(s.fact_recall)} ({s.n_facts_matched}/{s.n_facts})",
        f"{pct(s.needs_clarification_rate)} ({s.n_needs_clarification}/{s.n_active})",
        yn(s.decline_correct), yn(s.medical_question.correct), yn(s.safety.correct),
        str(s.turns), num(s.wall_time_s), tokens, num(s.cost_usd, "{:.3f}"),
    ]


AGG_HEADERS = [
    "group", "n", "with profile", "coverage", "sev exact", "sev ±1", "fact recall", "needs-clar",
    "declined ok", "med Q ok", "safety ok", "mean turns", "mean wall s", "tokens in/out", "cost $",
]


def agg_row(a: AggregateScore) -> list[str]:
    return [
        a.group, str(a.n_personas), str(a.n_with_profile), pct(a.coverage_rate), pct(a.severity_exact_rate),
        pct(a.severity_within_one_rate), pct(a.fact_recall), pct(a.needs_clarification_rate),
        pct(a.decline_correct_rate), pct(a.medical_question_correct_rate), pct(a.safety_correct_rate),
        num(a.mean_turns, "{:.1f}"), num(a.mean_wall_time_s), f"{a.total_input_tokens}/{a.total_output_tokens}",
        num(a.total_cost_usd, "{:.3f}"),
    ]


def render_markdown(scores: RunScores) -> str:
    lines = [
        "# FACE-Q Conversation — eval report",
        "",
        f"Run: `{scores.run_dir}`  ",
        f"Generated: {scores.generated_at}  ",
        f"Personas: {scores.n_personas}",
        "",
        "AI-assisted inferred profiles are compared against hidden persona ground truth. "
        "Nothing here is a FACE-Q score.",
        "",
        "## Per persona",
        "",
        _md_table(PERSONA_HEADERS, [persona_row(s) for s in scores.personas]),
        "",
        "## Aggregates",
        "",
        _md_table(AGG_HEADERS, [agg_row(a) for a in scores.aggregates]),
        "",
    ]
    if scores.construct_map_checked:
        if scores.unknown_ground_truth_ids:
            lines += [
                "## Ground-truth construct ids not present in the fetched construct map",
                "",
                "Fix these in `eval/personas/_construct_ids.yaml` (one edit reconciles every persona):",
                "",
                *[f"- `{cid}`" for cid in scores.unknown_ground_truth_ids],
                "",
            ]
        else:
            lines += ["All ground-truth construct ids were found in the fetched construct map.", ""]
    else:
        lines += ["Construct map was not available for this run; ground-truth ids were not checked against it.", ""]

    lines += ["## Details", ""]
    for s in scores.personas:
        lines += [f"### {s.persona_id}", ""]
        if s.error:
            lines += [f"**Error:** {s.error}", ""]
        lines += [
            f"- Safety: expected={yn(s.safety.expected)} intercepted={yn(s.safety.intercepted)}"
            + (f" (turn {s.safety.halted_turn})" if s.safety.halted_turn else ""),
            f"- Medical question: expected={yn(s.medical_question.expected)} observed={yn(s.medical_question.observed)}"
            + (f" keyword hit={yn(s.medical_question.keyword_hit)}" if s.medical_question.keyword_hit is not None else ""),
        ]
        for d in s.declines:
            lines.append(
                f"- Decline `{d.construct_id}`: in declined list={yn(d.in_declined_list)}, decline turn={d.decline_turn}, "
                f"re-asked {d.re_ask_count}x{(' at turns ' + ', '.join(map(str, d.re_ask_turns))) if d.re_ask_turns else ''}"
            )
        lines += ["", _md_table(
            ["construct", "expected", "observed", "status", "conf", "covered", "exact", "±1"],
            [
                [c.construct_id, c.expected, c.observed or "–", c.status or "–", num(c.confidence, "{:.2f}"),
                 yn(c.covered), yn(c.exact), yn(c.within_one)]
                for c in s.constructs
            ],
        ), ""]
        lines += [_md_table(
            ["narrative fact", "matched", "via"],
            [[f.text, yn(f.matched), f.matched_phrase or "–"] for f in s.facts],
        ), ""]
    if scores.warnings:
        lines += ["## Warnings", "", *[f"- {w}" for w in scores.warnings], ""]
    return "\n".join(lines)


def print_console(scores: RunScores, console: Console | None = None) -> None:
    console = console or Console()
    table = Table(title="FACE-Q eval — per persona")
    for h in PERSONA_HEADERS:
        table.add_column(h)
    for s in scores.personas:
        table.add_row(*persona_row(s))
    console.print(table)
    agg = Table(title="Aggregates")
    for h in AGG_HEADERS:
        agg.add_column(h)
    for a in scores.aggregates:
        agg.add_row(*agg_row(a))
    console.print(agg)
    if scores.unknown_ground_truth_ids:
        console.print(f"[yellow]Ground-truth ids not in map:[/] {', '.join(scores.unknown_ground_truth_ids)}")


def write_report(scores: RunScores, reports_dir: Path = REPORTS_DIR, run_dir: Path | None = None) -> tuple[Path, Path]:
    reports_dir.mkdir(parents=True, exist_ok=True)
    md = render_markdown(scores)
    js = json.dumps(scores.model_dump(), indent=2, ensure_ascii=False)
    md_path, json_path = reports_dir / "latest.md", reports_dir / "latest.json"
    md_path.write_text(md, encoding="utf-8")
    json_path.write_text(js, encoding="utf-8")
    if run_dir is not None:
        (run_dir / "report.md").write_text(md, encoding="utf-8")
        (run_dir / "scores.json").write_text(js, encoding="utf-8")
    return md_path, json_path
