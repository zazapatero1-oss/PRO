from __future__ import annotations

import json

import pytest
from conftest import make_profile, make_record
from test_runner import FakeApi, FakePatientClient, make_runner

from faceq_eval.cli import main
from faceq_eval.config import ConfigError, EvalConfig
from faceq_eval.report import render_markdown, write_report
from faceq_eval.runner import run_all
from faceq_eval.score import load_run_dir, score_run

ENV = {
    "FUNCTIONS_URL": "https://abc.supabase.co/functions/v1",
    "SUPABASE_URL": "https://abc.supabase.co",
    "SUPABASE_ANON_KEY": "anon",
    "EVAL_CLINICIAN_EMAIL": "eval@example.test",
    "EVAL_CLINICIAN_PASSWORD": "pw",
}


def test_config_defaults_and_required():
    cfg = EvalConfig.from_env(ENV)
    assert cfg.patient_model == "claude-sonnet-5" and cfg.max_turns == 60 and cfg.anthropic_api_key is None
    with pytest.raises(ConfigError, match="EVAL_CLINICIAN_PASSWORD"):
        EvalConfig.from_env({k: v for k, v in ENV.items() if k != "EVAL_CLINICIAN_PASSWORD"})
    cfg = EvalConfig.from_env({**ENV, "EVAL_MAX_TURNS": "12", "EVAL_PATIENT_MODEL": "claude-haiku-5", "FUNCTIONS_URL": ENV["FUNCTIONS_URL"] + "/"})
    assert cfg.max_turns == 12 and cfg.patient_model == "claude-haiku-5" and not cfg.functions_url.endswith("/")


def test_config_refuses_demo_unless_allowed():
    with pytest.raises(ConfigError, match="demo"):
        EvalConfig.from_env({**ENV, "FUNCTIONS_URL": "https://faceq-demo.supabase.co/functions/v1"})
    with pytest.raises(ConfigError, match="demo"):
        EvalConfig.from_env({**ENV, "SUPABASE_URL": "https://DEMO-project.supabase.co"})
    cfg = EvalConfig.from_env({**ENV, "FUNCTIONS_URL": "https://faceq-demo.supabase.co/functions/v1", "EVAL_ALLOW_DEMO": "1"})
    assert cfg.allow_demo


def test_render_markdown_and_write_report(personas, registry, evasive_persona, evasive_profile, tmp_path):
    records = [make_record(evasive_persona.id, evasive_profile, wall_time_s=3.0)]
    scores = score_run(personas, records, registry, {"adult": {"map": {"domains": []}}, "pediatric": None}, "run-y")
    md = render_markdown(scores)
    assert "## Per persona" in md and "## Aggregates" in md and evasive_persona.id in md
    assert "not present in the fetched construct map" in md
    assert "FACE-Q score" in md  # the "not a score" disclaimer
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    md_path, json_path = write_report(scores, tmp_path / "reports", run_dir)
    assert md_path.read_text(encoding="utf-8") == md
    data = json.loads(json_path.read_text(encoding="utf-8"))
    assert data["n_personas"] == 1 and data["personas"][0]["persona_id"] == evasive_persona.id
    assert (run_dir / "report.md").exists() and (run_dir / "scores.json").exists()


def test_report_has_the_v11_columns_and_sections(personas, registry, evasive_persona, tmp_path):
    profile = make_profile(
        {
            "appearance.lips": {
                "severity": "severe",
                "facets_covered": ["shape", "fullness"],
                "facets_missing": ["movement"],
                "confirmed": True,
            }
        }
    )
    turns = [
        (None, "How do you feel about your face overall?", []),
        ("fine", "Which parts of your face are on your mind - lips, cheeks?", []),
    ]
    records = [
        make_record(
            evasive_persona.id,
            profile,
            turns,
            latencies=[(420.0, 2100.0), (380.0, 1900.0)],
            session_row={"status": "completed", "focus_constructs": ["appearance.lips", "appearance.cheeks"]},
        )
    ]
    cmap = {"adult": {"map": {"domains": [{"id": "appearance", "constructs": [
        {"id": "appearance.lips", "label": "Lips", "facets": [{"id": "shape"}, {"id": "fullness"}, {"id": "symmetry"}]},
    ]}]}}, "pediatric": None}
    scores = score_run(personas, records, registry, cmap, "run-v11")
    md = render_markdown(scores)
    for header in ("facet recall", "triage", "focus P/R", "confirm", "TTFT ms med/p90", "turn ms med/p90"):
        assert header in md
    assert "Triage screen (first" in md
    assert "Facets of the focus constructs" in md
    assert "Latency: TTFT median 400 ms / p90 416 ms" in md  # median of 420/380
    assert "`appearance.lips`" in md
    # facets the map does not have are surfaced the same way unknown construct ids are
    assert "not present in the fetched construct map" in md
    assert "aging.appraisal.perceived_vs_actual" in md


def test_offline_end_to_end_run_score_report(personas, registry, tmp_path, monkeypatch, capsys):
    """Fake API + fake patient -> run dir -> `score` and `report` CLI commands."""
    subset = [p for p in personas if p.id in ("en_adult_injectables_evasive", "en_adult_hn_cancer_safety")]
    api = FakeApi([], profile=make_profile({"appearance.lips": {"severity": "severe"}}, declined=["social.avoidance"]))
    runner = make_runner(api, FakePatientClient(), registry)
    run_dir = tmp_path / "runs" / "t1"
    run_dir.mkdir(parents=True)
    run_all(runner, subset, run_dir, construct_maps={"adult": {"map": {"domains": [{"id": "appearance", "constructs": [{"id": "appearance.lips", "label": "Lips"}]}]}}, "pediatric": None})
    records, maps = load_run_dir(run_dir)
    assert len(records) == 2 and maps["adult"]["map"]["domains"]

    assert main(["score", str(run_dir)]) == 0
    assert (run_dir / "scores.json").exists()
    assert "wrote" in capsys.readouterr().out
    written = json.loads((run_dir / "scores.json").read_text(encoding="utf-8"))
    assert {p["persona_id"] for p in written["personas"]} == {p.id for p in subset}

    monkeypatch.setattr("faceq_eval.cli.REPORTS_DIR", tmp_path / "reports")
    assert main(["report", str(run_dir)]) == 0
    latest = (tmp_path / "reports" / "latest.md").read_text(encoding="utf-8")
    assert "en_adult_injectables_evasive" in latest
    scores = json.loads((tmp_path / "reports" / "latest.json").read_text(encoding="utf-8"))
    # The fake ends every session normally, so the safety persona is (correctly) reported as NOT intercepted.
    safety = next(p for p in scores["personas"] if p["persona_id"] == "en_adult_hn_cancer_safety")
    assert safety["safety"]["expected"] is True and safety["safety"]["correct"] is False
    assert "appearance.overall" in scores["unknown_ground_truth_ids"]


def test_cli_validate_and_run_refuses_without_config(monkeypatch, capsys):
    assert main(["validate"]) == 0
    for k in ENV:
        monkeypatch.delenv(k, raising=False)
    assert main(["run"]) == 2
    assert "config error" in capsys.readouterr().err
    monkeypatch.setenv("FUNCTIONS_URL", "https://x-demo.supabase.co/functions/v1")
    for k, v in ENV.items():
        if k != "FUNCTIONS_URL":
            monkeypatch.setenv(k, v)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    assert main(["run"]) == 2
    assert "demo" in capsys.readouterr().err
