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


# ------------------------------------------------------------------ v1.1 facets / focus


def test_every_persona_has_expected_focus_with_facets(personas, registry):
    for p in personas:
        assert 2 <= len(p.expected_focus) <= 4, p.id
        assert set(p.expected_focus) <= set(p.ground_truth.constructs), p.id
        assert set(p.expected_focus) <= registry.ids_for(p.population), p.id
        for cid in p.expected_focus:
            facets = p.ground_truth.facets_for(cid)
            assert 3 <= len(facets) <= 8, f"{p.id}:{cid} has {len(facets)} facets"
            assert all(v.strip() for v in facets.values()), f"{p.id}:{cid}"
            assert p.ground_truth.severities[cid] != "declined", p.id
        # only focus constructs carry facets
        with_facets = {cid for cid, c in p.ground_truth.constructs.items() if c.facets}
        assert with_facets == set(p.expected_focus), p.id


def test_persona_facet_ids_are_in_the_facet_registry(personas, registry, facet_registry):
    assert validate_persona_set(personas, registry, facet_registry) == []
    for p in personas:
        for cid, c in p.ground_truth.constructs.items():
            unknown = set(c.facets) - facet_registry.facets_for(cid)
            assert not unknown, f"{p.id}: {cid} -> {sorted(unknown)}"


def test_facet_registry_covers_every_construct_id(registry, facet_registry):
    assert set(facet_registry.constructs) == set(registry.constructs)
    for cid, facets in facet_registry.constructs.items():
        assert 5 <= len(facets) <= 8, f"{cid} has {len(facets)} facets"
        assert all(fid == fid.lower() and " " not in fid for fid in facets), cid
        assert all(label.strip() for label in facets.values()), cid


def test_validate_flags_unknown_facet_id(personas, registry, facet_registry):
    bad = next(p for p in personas if p.id == "en_adult_rhinoplasty_terse").model_copy(deep=True)
    bad.ground_truth.constructs["appearance.nose"].facets["nostril_shape"] = "made up id"
    problems = validate_persona_set([bad], registry, facet_registry)
    assert any("appearance.nose.nostril_shape" in x for x in problems)


def test_validate_flags_facet_registry_id_missing_from_construct_registry(personas, registry, facet_registry):
    broken = facet_registry.model_copy(deep=True)
    broken.constructs["nope.nothing"] = {"a": "A", "b": "B", "c": "C", "d": "D", "e": "E"}
    problems = validate_persona_set(personas, registry, broken)
    assert any("nope.nothing" in x and "_construct_ids.yaml" in x for x in problems)


def test_validate_flags_expected_focus_outside_population(personas, registry, facet_registry):
    ped = next(p for p in personas if p.population == "pediatric").model_copy(deep=True)
    # aging.appraisal is adult-only; give it ground truth + facets so the model validator passes
    ped.ground_truth.constructs["aging.appraisal"] = ped.ground_truth.constructs[ped.expected_focus[0]]
    ped.expected_focus = [*ped.expected_focus, "aging.appraisal"]
    problems = validate_persona_set([ped], registry, facet_registry)
    assert any("aging.appraisal" in x and "pediatric map" in x for x in problems)


def test_persona_model_rejects_bad_focus_declarations():
    raw = yaml.safe_load((PERSONA_DIR / "en_adult_rhinoplasty_terse.yaml").read_text(encoding="utf-8"))
    with pytest.raises(ValueError, match="expected_focus"):
        Persona.model_validate({**raw, "expected_focus": ["appearance.nose"]})  # fewer than 2
    with pytest.raises(ValueError, match="must list facets"):
        Persona.model_validate({**raw, "expected_focus": [*raw["expected_focus"], "appearance.eyes"]})
    dropped = {**raw, "expected_focus": raw["expected_focus"][:2]}
    with pytest.raises(ValueError, match="not in expected_focus"):
        Persona.model_validate(dropped)  # distress.hiding still carries facets
    declined = yaml.safe_load((PERSONA_DIR / "en_adult_injectables_evasive.yaml").read_text(encoding="utf-8"))
    declined["ground_truth"]["constructs"]["social.avoidance"] = {"severity": "declined", "facets": {"frequency": "x"}}
    with pytest.raises(ValueError, match="declined construct cannot carry facets"):
        Persona.model_validate(declined)


def test_focus_facets_reach_the_patient_prompt(personas, registry, facet_registry):
    for p in personas:
        prompt = build_system_prompt(p, registry, facet_registry)
        for cid in p.expected_focus:
            for fid, detail in p.ground_truth.facets_for(cid).items():
                assert facet_registry.label(cid, fid) in prompt, f"{p.id}:{cid}.{fid}"
                assert detail in prompt, f"{p.id}:{cid}.{fid}"
        assert "ONE detail per reply" in prompt


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
