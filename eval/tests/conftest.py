from __future__ import annotations

import copy
from typing import Any

import pytest

from faceq_eval.models import ConstructRegistry, FacetRegistry, Persona, RunRecord, TurnRecord
from faceq_eval.personas import load_facet_registry, load_personas, load_registry


@pytest.fixture(scope="session")
def registry() -> ConstructRegistry:
    return load_registry()


@pytest.fixture(scope="session")
def facet_registry() -> FacetRegistry:
    return load_facet_registry()


@pytest.fixture(scope="session")
def personas() -> list[Persona]:
    return load_personas()


@pytest.fixture
def evasive_persona(personas) -> Persona:
    return next(p for p in personas if p.id == "en_adult_injectables_evasive")


@pytest.fixture
def safety_persona(personas) -> Persona:
    return next(p for p in personas if p.id == "en_adult_hn_cancer_safety")


@pytest.fixture
def medical_persona(personas) -> Persona:
    return next(p for p in personas if p.id == "es_pediatric_cleft_guardian")


def make_profile(constructs: dict[str, dict[str, Any]], **extra: Any) -> dict[str, Any]:
    """Build a minimal SPEC §8 profile; constructs are grouped by their id prefix."""
    domains: dict[str, dict[str, Any]] = {}
    for cid, c in constructs.items():
        dom = cid.split(".")[0]
        domains.setdefault(dom, {"id": dom, "label": dom, "severity": "mild", "confidence": 0.7, "summary_en": "", "constructs": []})
        domains[dom]["constructs"].append({"id": cid, "quotes": [], "findings": [], "status": "covered", "confidence": 0.8, **c})
    profile = {
        "generated_with": {"model": "test", "prompt_version": "t", "map": "face-q-adult@1"},
        "domains": list(domains.values()),
        "needs_clarification": [],
        "not_covered": [],
        "declined": [],
        "patient_questions": [],
        "change_from_prior": [],
        "disclaimer": "AI-assisted inferred profile. Not a validated FACE-Q score.",
    }
    profile.update(extra)
    return profile


def make_record(
    persona_id: str,
    profile: dict[str, Any] | None,
    turns: list[tuple[str | None, str, list[dict]]] | None = None,
    latencies: list[tuple[float | None, float | None]] | None = None,
    **kw: Any,
) -> RunRecord:
    """`latencies` is an optional list of (time_to_first_token_ms, turn_ms) per turn."""
    rec = RunRecord(persona_id=persona_id, started_at="2026-01-01T00:00:00+00:00", outcome=kw.pop("outcome", "ended"), profile=copy.deepcopy(profile), **kw)
    for i, (patient, assistant, events) in enumerate(turns or [], start=1):
        ttft, turn_ms = (latencies[i - 1] if latencies and i - 1 < len(latencies) else (None, None))
        rec.turns.append(
            TurnRecord(
                turn=i,
                patient_text=patient,
                input_mode="text" if patient else None,
                assistant_text=assistant,
                events=events,
                time_to_first_token_ms=ttft,
                turn_ms=turn_ms,
            )
        )
    return rec


def evidence_event(construct_id: str, facets: list[str] | None = None, **kw: Any) -> dict[str, Any]:
    return {
        "event": "evidence",
        "construct_id": construct_id,
        "severity": kw.pop("severity", "moderate"),
        "confidence": kw.pop("confidence", 0.8),
        "facets": facets or [],
        "triage_item": kw.pop("triage_item", None),
    }


@pytest.fixture
def evasive_profile() -> dict[str, Any]:
    return make_profile(
        {
            "appearance.overall": {"severity": "moderate", "quotes": [{"text": "honestly it's fine, mostly", "lang": "en", "gloss_en": "honestly it's fine, mostly"}]},
            "appearance.lips": {"severity": "severe", "quotes": [{"text": "I've always hated how thin my lips are", "lang": "en", "gloss_en": "I've always hated how thin my lips are"}]},
            "appearance.cheeks": {"severity": "mild"},  # off by one
            "appearance.skin": {"severity": "severe", "findings": [{"category": "triggers", "text": "Keeps the camera above eye level on video calls"}]},  # off by two
            "appearance.eyes": {"severity": "none"},
            "aging.appraisal": {"severity": "moderate", "status": "drill_down_done"},
            "psych.self_confidence": {"severity": "unclear", "status": "needs_clarification", "confidence": 0.4},
            "psych.mood": {"severity": "mild"},
            "distress.hiding": {"severity": None, "status": "untouched"},
            "social.avoidance": {"severity": "declined", "status": "declined"},
            "social.comfort": {"severity": "mild"},
        },
        needs_clarification=[{"construct_id": "psych.self_confidence", "reason": "hedged"}],
        not_covered=["distress.hiding"],
        declined=["social.avoidance"],
    )
