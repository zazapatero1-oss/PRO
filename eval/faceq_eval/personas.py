"""Load personas and the construct-id registry from eval/personas."""

from __future__ import annotations

from pathlib import Path

import yaml

from faceq_eval.models import ConstructRegistry, Persona

PERSONA_DIR = Path(__file__).resolve().parent.parent / "personas"
REGISTRY_FILE = "_construct_ids.yaml"


def load_registry(persona_dir: Path = PERSONA_DIR) -> ConstructRegistry:
    with (persona_dir / REGISTRY_FILE).open(encoding="utf-8") as f:
        return ConstructRegistry.model_validate(yaml.safe_load(f))


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


def validate_persona_set(personas: list[Persona], registry: ConstructRegistry) -> list[str]:
    """Return a list of problems (empty when the set is consistent)."""
    problems: list[str] = []
    known = set(registry.constructs)
    for p in personas:
        for cid in p.ground_truth.constructs:
            if cid not in known:
                problems.append(f"{p.id}: ground-truth construct '{cid}' not in {REGISTRY_FILE}")
        for fact in p.ground_truth.narrative_facts:
            if fact.construct_id and fact.construct_id not in known:
                problems.append(f"{p.id}: narrative fact construct '{fact.construct_id}' not in {REGISTRY_FILE}")
        for cid in p.expected_behaviours.declines:
            if cid not in known:
                problems.append(f"{p.id}: declined construct '{cid}' not in {REGISTRY_FILE}")
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
