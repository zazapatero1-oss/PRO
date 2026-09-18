"""`python -m faceq_eval run|score|report`."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from faceq_eval.personas import load_personas, load_registry, validate_persona_set
from faceq_eval.report import REPORTS_DIR, print_console, write_report
from faceq_eval.score import load_run_dir, score_run


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="faceq_eval", description="FACE-Q Conversation eval harness")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="run every persona against the dev environment, then score and report")
    run.add_argument("--personas", help="comma-separated persona ids (default: all)")
    run.add_argument("--parallel", type=int, default=1, help="run N personas concurrently (default 1)")
    run.add_argument("--max-turns", type=int, help="override EVAL_MAX_TURNS")
    run.add_argument("--run-dir", help="write run files here instead of eval/reports/runs/<timestamp>")

    sc = sub.add_parser("score", help="score an existing run directory")
    sc.add_argument("run_dir")

    rp = sub.add_parser("report", help="score a run directory and write eval/reports/latest.{md,json}")
    rp.add_argument("run_dir")

    sub.add_parser("validate", help="validate persona YAML files offline")
    return p


def _validate() -> int:
    registry = load_registry()
    personas = load_personas()
    problems = validate_persona_set(personas, registry)
    for p in personas:
        print(f"ok  {p.id:40s} {p.language} {p.population:9s} {p.intake.diagnosis_code:18s} {p.personality.style}")
    for problem in problems:
        print(f"ERR {problem}")
    return 1 if problems else 0


def _score(run_dir: Path, write: bool):
    registry = load_registry()
    personas = load_personas()
    records, construct_maps = load_run_dir(run_dir)
    if not records:
        print(f"no run records found in {run_dir}", file=sys.stderr)
        return None
    scores = score_run(personas, records, registry, construct_maps, str(run_dir))
    if write:
        md, js = write_report(scores, REPORTS_DIR, run_dir)
        print(f"wrote {md} and {js}")
    else:
        (run_dir / "scores.json").write_text(json.dumps(scores.model_dump(), indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {run_dir / 'scores.json'}")
    print_console(scores)
    return scores


def _run(args: argparse.Namespace) -> int:
    # Imported lazily so `score`/`report`/`validate` never need env vars or network.
    from faceq_eval.api import HttpFaceQApi
    from faceq_eval.config import ConfigError, EvalConfig
    from faceq_eval.patient import AnthropicPatientClient
    from faceq_eval.runner import PersonaRunner, new_run_dir, run_all

    try:
        cfg = EvalConfig.from_env()
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2
    if not cfg.anthropic_api_key:
        print("config error: ANTHROPIC_API_KEY is required to simulate patients", file=sys.stderr)
        return 2

    registry = load_registry()
    only = [s.strip() for s in args.personas.split(",")] if args.personas else None
    personas = load_personas(only=only)
    problems = validate_persona_set(load_personas(), registry)
    if problems:
        for problem in problems:
            print(f"persona error: {problem}", file=sys.stderr)
        return 2

    api = HttpFaceQApi(cfg)
    api.sign_in()
    construct_maps = {
        "adult": api.fetch_construct_map(cfg.construct_map_slug),
        "pediatric": api.fetch_construct_map(cfg.pediatric_map_slug),
    }
    for pop, cmap in construct_maps.items():
        if cmap is None:
            print(f"warning: no approved construct map found for {pop}", file=sys.stderr)

    def patient_client_factory(_persona):
        return AnthropicPatientClient(cfg.anthropic_api_key or "", cfg.patient_model)

    runner = PersonaRunner(
        api,
        patient_client_factory,
        registry,
        max_turns=args.max_turns or cfg.max_turns,
        patient_model=cfg.patient_model,
    )
    run_dir = Path(args.run_dir) if args.run_dir else new_run_dir(REPORTS_DIR)
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"run dir: {run_dir}")
    run_all(
        runner,
        personas,
        run_dir,
        parallel=args.parallel,
        construct_maps=construct_maps,
        meta={"functions_url": cfg.functions_url, "patient_model": cfg.patient_model, "max_turns": args.max_turns or cfg.max_turns},
    )
    scores = _score(run_dir, write=True)
    return 0 if scores is not None else 1


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if args.cmd == "validate":
        return _validate()
    if args.cmd == "score":
        return 0 if _score(Path(args.run_dir), write=False) is not None else 1
    if args.cmd == "report":
        return 0 if _score(Path(args.run_dir), write=True) is not None else 1
    if args.cmd == "run":
        return _run(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
