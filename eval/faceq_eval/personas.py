"""Load personas and the construct-id registry from eval/personas."""

from __future__ import annotations

from pathlib import Path

import yaml

from faceq_eval.models import ConstructRegistry, FacetRegistry, Persona

PERSONA_DIR = Path(__file__).resolve().parent.parent / "personas"
REGISTRY_FILE = "_construct_ids.yaml"
FACET_REGISTRY_FILE = "_facet_ids.yaml"


def load_registry(persona_dir: Path = PERSONA_DIR) -> ConstructRegistry:
    with (persona_dir / REGISTRY_FILE).open(encoding="utf-8") as f:
        return ConstructRegistry.model_validate(yaml.safe_load(f))


def load_facet_registry(persona_dir: Path = PERSONA_DIR) -> FacetRegistry:
    with (persona_dir / FACET_REGISTRY_FILE).open(encoding="utf-8") as f:
        return FacetRegistry.model_validate(yaml.safe_load(f))


def load_persona(path: Path) -> Persona:
    with path.open(encoding="utf-8") as f:
        return Persona.model_validate(yaml.safe_load(f))


def load_personas(persona_dir: Path = PERSONA_DIR, only: list[str] | None = None) -> list[Persona]:
    personas: list[Persona] = []
    for path in sorted(persona_dir.glob("*.yaml")):
        if path.name.startswith("_"):
            continue
        persona = load_persona(path)
        if persona.id != path.stem:
            raise ValueError(f"{path.name}: persona id '{persona.id}' must equal the file stem")
        if only and persona.id not in only:
            continue
        personas.append(persona)
    if only:
        missing = set(only) - {p.id for p in personas}
        if missing:
            raise ValueError(f"unknown persona id(s): {', '.join(sorted(missing))}")
    return personas


def validate_persona_set(
    personas: list[Persona],
    registry: ConstructRegistry,
    facet_registry: FacetRegistry | None = None,
) -> list[str]:
    """Return a list of problems (empty when the set is consistent).

    When `facet_registry` is given, ground-truth facet ids are checked against
    `_facet_ids.yaml` as well (and the registry itself against the construct ids).
    """
    problems: list[str] = []
    known = set(registry.constructs)
    post_op_only = set(registry.post_op_only)
    if facet_registry is not None:
        for cid in sorted(set(facet_registry.constructs) - known):
            problems.append(f"{FACET_REGISTRY_FILE}: construct '{cid}' is not in {REGISTRY_FILE}")
    for p in personas:
        allowed = registry.ids_for(p.population)
        referenced = (
            set(p.ground_truth.constructs)
            | {f.construct_id for f in p.ground_truth.narrative_facts if f.construct_id}
            | set(p.expected_behaviours.declines)
            | set(p.expected_focus)
            | set(p.clinician_note.focus_constructs if p.clinician_note else [])
        )
        for cid in sorted(referenced & known):
            if cid not in allowed:
                problems.append(f"{p.id}: construct '{cid}' is not in the {p.population} map")
        if p.timepoint in ("baseline", "pre-op"):
            for cid in sorted(set(p.ground_truth.constructs) & post_op_only):
                problems.append(f"{p.id}: '{cid}' is post-op only but the persona timepoint is {p.timepoint}")
        for cid in p.ground_truth.constructs:
            if cid not in known:
                problems.append(f"{p.id}: ground-truth construct '{cid}' not in {REGISTRY_FILE}")
        for fact in p.ground_truth.narrative_facts:
            if fact.construct_id and fact.construct_id not in known:
                problems.append(f"{p.id}: narrative fact construct '{fact.construct_id}' not in {REGISTRY_FILE}")
        for cid in p.expected_behaviours.declines:
            if cid not in known:
                problems.append(f"{p.id}: declined construct '{cid}' not in {REGISTRY_FILE}")
        for cid in p.expected_focus:
            if cid not in known:
                problems.append(f"{p.id}: expected_focus construct '{cid}' not in {REGISTRY_FILE}")
        if facet_registry is not None:
            for cid, c in p.ground_truth.constructs.items():
                if not c.facets:
                    continue
                unknown_facets = sorted(set(c.facets) - facet_registry.facets_for(cid))
                for fid in unknown_facets:
                    problems.append(f"{p.id}: facet '{cid}.{fid}' not in {FACET_REGISTRY_FILE}")
        if p.clinician_note:
            for cid in p.clinician_note.focus_constructs:
                if cid not in known:
                    problems.append(f"{p.id}: focus construct '{cid}' not in {REGISTRY_FILE}")
        if p.expected_behaviours.summary_correction and p.expected_behaviours.summary_correction.construct_id:
            if p.expected_behaviours.summary_correction.construct_id not in known:
                problems.append(f"{p.id}: summary_correction construct not in {REGISTRY_FILE}")
    safety = [p.id for p in personas if p.expected_behaviours.safety_intercept_expected]
    if len(safety) != 1:
        problems.append(f"expected exactly one safety persona, found {len(safety)}: {safety}")
    return problems
