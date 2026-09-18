import pytest
import yaml

from faceq_eval.models import Persona
from faceq_eval.personas import PERSONA_DIR, load_personas, validate_persona_set
from faceq_eval.patient import build_system_prompt


def test_all_personas_load_and_are_consistent(personas, registry):
    assert len(personas) >= 8
    assert validate_persona_set(personas, registry) == []
    ids = [p.id for p in personas]
    assert len(ids) == len(set(ids))


def test_exactly_one_safety_persona(personas):
    safety = [p for p in personas if p.expected_behaviours.safety_intercept_expected]
    assert len(safety) == 1
    (p,) = safety
    assert p.language == "en" and p.population == "adult" and p.safety is not None
    assert 6 <= p.safety.introduce_at_turn <= 8


def test_persona_mix(personas):
    langs = {p.language for p in personas}
    pops = {p.population for p in personas}
    assert langs == {"en", "es"} and pops == {"adult", "pediatric"}
    assert all(p.respondent in ("guardian", "both") for p in personas if p.population == "pediatric")
    assert {p.intake.diagnosis_code for p in personas} >= {
        "rhinoplasty", "facelift", "injectables", "cleft-lip-palate", "hn-cancer", "skin-cancer-face", "craniosynostosis"
    }
    assert {p.timepoint for p in personas} <= {"baseline", "post-op-6w"}
    styles = {p.personality.style for p in personas}
    assert {"terse", "chatty", "evasive", "switches-language"} <= styles
    assert any(p.expected_behaviours.declines for p in personas)
    assert any(p.expected_behaviours.asks_medical_question for p in personas)


def test_ground_truth_ids_all_in_registry(personas, registry):
    for p in personas:
        assert set(p.ground_truth.constructs) <= set(registry.constructs), p.id


def test_registry_matches_real_seed_maps(registry):
    adult, pediatric = registry.ids_for("adult"), registry.ids_for("pediatric")
    assert len(adult) == 33 and len(pediatric) == 31
    assert {"aging.appraisal", "distress.cancer_worry", "function.swallowing_oral", "social.relationships"} <= adult
    assert {"aging.appraisal", "distress.cancer_worry", "function.swallowing_oral", "social.relationships"}.isdisjoint(pediatric)
    assert {"appearance.ears", "social.school"} <= pediatric and {"appearance.ears", "social.school"}.isdisjoint(adult)
    assert set(registry.constructs) == adult | pediatric
    assert set(registry.post_op_only) == {"recovery.daily_activities", "outcome.result", "outcome.decision", "outcome.information"}


def test_personas_only_reference_ids_of_their_population(personas, registry):
    for p in personas:
        allowed = registry.ids_for(p.population)
        referenced = set(p.ground_truth.constructs) | {f.construct_id for f in p.ground_truth.narrative_facts if f.construct_id}
        referenced |= set(p.expected_behaviours.declines)
        if p.clinician_note:
            referenced |= set(p.clinician_note.focus_constructs)
        assert referenced <= allowed, f"{p.id}: {sorted(referenced - allowed)}"


def test_baseline_personas_have_no_post_op_only_constructs(personas, registry):
    post_op = set(registry.post_op_only)
    for p in personas:
        if p.timepoint in ("baseline", "pre-op"):
            assert not (set(p.ground_truth.constructs) & post_op), p.id
        else:
            # every post-op persona carries at least one outcome/recovery construct
            assert set(p.ground_truth.constructs) & post_op, p.id


def test_validate_persona_set_flags_population_and_timepoint_violations(personas, registry):
    ped = next(p for p in personas if p.population == "pediatric").model_copy(deep=True)
    ped.ground_truth.constructs["aging.appraisal"] = "mild"  # adult-only id
    problems = validate_persona_set(personas + [ped], registry)
    assert any("aging.appraisal" in x and "pediatric map" in x for x in problems)
    base = next(p for p in personas if p.timepoint == "baseline" and p.population == "adult").model_copy(deep=True)
    base.ground_truth.constructs["outcome.result"] = "none"
    problems = validate_persona_set(personas + [base], registry)
    assert any("post-op only" in x for x in problems)


def test_registry_rejects_unknown_ids_in_lists(registry):
    from faceq_eval.models import ConstructRegistry
    raw = registry.model_dump()
    raw["populations"]["adult"].append("nope.nothing")
    with pytest.raises(ValueError, match="nope.nothing"):
        ConstructRegistry.model_validate(raw)


def test_load_personas_only_and_unknown(personas):
    assert [p.id for p in load_personas(only=["en_adult_rhinoplasty_terse"])] == ["en_adult_rhinoplasty_terse"]
    with pytest.raises(ValueError):
        load_personas(only=["nope"])


def test_persona_validation_rejects_bad_files():
    raw = yaml.safe_load((PERSONA_DIR / "en_adult_injectables_evasive.yaml").read_text(encoding="utf-8"))
    bad = dict(raw)
    bad["expected_behaviours"] = {**raw["expected_behaviours"], "declines": []}  # GT says declined
    with pytest.raises(ValueError):
        Persona.model_validate(bad)
    bad = dict(raw)
    bad["population"] = "pediatric"  # respondent self not allowed
    with pytest.raises(ValueError):
        Persona.model_validate(bad)
    bad = dict(raw)
    bad["safety"] = {"introduce_at_turn": 7, "ideation_text": "x"}  # flag not set
    with pytest.raises(ValueError):
        Persona.model_validate(bad)


def test_system_prompt_mentions_key_instructions(personas, registry):
    for p in personas:
        prompt = build_system_prompt(p, registry)
        assert "Never reveal" in prompt
        assert p.backstory.strip()[:40] in prompt
        for cid in p.expected_behaviours.declines:
            assert registry.constructs[cid].patient_topic in prompt or registry.constructs[cid].patient_topic_es in prompt
        if p.safety:
            assert f"reply number {p.safety.introduce_at_turn}" in prompt
        if p.personality.switch_language_to:
            assert "switch to" in prompt
        if p.speaker != "self":
            assert "parent/guardian" in prompt
        assert "severe" not in prompt.split("RULES:")[1]  # no severity labels leak into rules
