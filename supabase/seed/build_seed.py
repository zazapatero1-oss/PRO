#!/usr/bin/env python3
"""Regenerate seed.sql from the JSON sources in this directory.

The JSON files are the source of truth; seed.sql is a build product committed
for convenience so that `psql -f seed.sql` works without tooling. Run this
after editing instruments.json, diagnosis_catalog.json or construct_maps/*.json:

    python3 supabase/seed/build_seed.py

Standard library only. Deterministic output.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "seed.sql"

# Stable ids so demo.sql and later migrations can reference maps by id or slug.
# Keyed by (slug, version): a new map version is a new row, so it needs its own
# id or it would collide with the previous version's primary key on a database
# that already carries it. Ids of retired versions stay listed as history.
MAP_IDS = {
    ("face-q-adult", 1): "7a1c5e20-0002-4a00-8000-000000000001",
    ("face-q-pediatric", 1): "7a1c5e20-0002-4a00-8000-000000000002",
    ("face-q-adult", 2): "7a1c5e20-0002-4a00-8000-000000000011",
    ("face-q-pediatric", 2): "7a1c5e20-0002-4a00-8000-000000000012",
}

TAG = "$seed$"


def q(value: str | None) -> str:
    """Dollar-quote a text value (or NULL)."""
    if value is None:
        return "null"
    if TAG in value:
        raise ValueError(f"value contains dollar-quote tag {TAG!r}")
    return f"{TAG}{value}{TAG}"


def text_array(values: list[str]) -> str:
    if not values:
        return "'{}'::text[]"
    return "array[" + ", ".join(q(v) for v in values) + "]::text[]"


def uuid_array(values: list[str]) -> str:
    if not values:
        return "'{}'::uuid[]"
    return "array[" + ", ".join(f"'{v}'" for v in values) + "]::uuid[]"


def check_facets_and_triage(m: dict) -> None:
    """Enforce the SPEC v1.1 §A invariants the tracker relies on."""
    slug = m["slug"]
    construct_ids = [c["id"] for d in m["domains"] for c in d["constructs"]]
    for dom in m["domains"]:
        for c in dom["constructs"]:
            facets = c.get("facets")
            if not isinstance(facets, list) or not 5 <= len(facets) <= 8:
                raise ValueError(f"{slug}/{c['id']}: needs 5-8 facets, has {len(facets or [])}")
            ids = [f["id"] for f in facets]
            if len(set(ids)) != len(ids):
                raise ValueError(f"{slug}/{c['id']}: duplicate facet ids")
            for f in facets:
                if not re.fullmatch(r"[a-z][a-z0-9_]*", f["id"]) or not f.get("label"):
                    raise ValueError(f"{slug}/{c['id']}: bad facet {f!r}")

    triage = m.get("triage")
    if not isinstance(triage, list) or len(triage) < 4:
        raise ValueError(f"{slug}: triage block needs at least 4 items")
    if len({t["id"] for t in triage}) != len(triage):
        raise ValueError(f"{slug}: duplicate triage ids")
    for t in triage:
        if not t.get("intent") or not t.get("maps_to"):
            raise ValueError(f"{slug}/triage {t.get('id')}: needs intent and maps_to")
        for pattern in t["maps_to"]:
            prefix = pattern[:-1] if pattern.endswith("*") else None
            hit = (
                any(cid.startswith(prefix) for cid in construct_ids)
                if prefix is not None
                else pattern in construct_ids
            )
            if not hit:
                raise ValueError(f"{slug}/triage {t['id']}: {pattern} matches no construct")

    if "focus_facet_threshold" not in m["coverage_rules"]:
        raise ValueError(f"{slug}: coverage_rules needs focus_facet_threshold")


def build() -> str:
    instruments = json.loads((HERE / "instruments.json").read_text())
    diagnoses = json.loads((HERE / "diagnosis_catalog.json").read_text())
    maps = [
        json.loads(p.read_text())
        for p in sorted((HERE / "construct_maps").glob("*.json"))
    ]
    inst_by_slug = {i["slug"]: i for i in instruments}

    out: list[str] = []
    w = out.append
    w("-- GENERATED FILE. Do not edit by hand; run supabase/seed/build_seed.py.")
    w("-- Reference data for FACE-Q Conversation: instruments, diagnosis catalog and")
    w("-- approved construct maps. Idempotent (upserts). No item text from any instrument.")
    w("")
    w("begin;")
    w("")

    # ---- instruments ---------------------------------------------------
    w("-- instruments")
    for i in instruments:
        if i.get("item_text_stored", False):
            raise ValueError(f"{i['slug']}: item_text_stored must be false")
        w(
            "insert into public.instruments "
            "(id, slug, name, version, publisher, license_notes, license_url, item_text_stored)\n"
            "values (\n"
            f"  '{i['id']}',\n"
            f"  {q(i['slug'])},\n"
            f"  {q(i['name'])},\n"
            f"  {q(i['version'])},\n"
            f"  {q(i['publisher'])},\n"
            f"  {q(i['license_notes'])},\n"
            f"  {q(i.get('license_url'))},\n"
            "  false\n"
            ")\n"
            "on conflict (slug) do update set\n"
            "  name = excluded.name,\n"
            "  version = excluded.version,\n"
            "  publisher = excluded.publisher,\n"
            "  license_notes = excluded.license_notes,\n"
            "  license_url = excluded.license_url,\n"
            "  item_text_stored = false;"
        )
        w("")

    # ---- diagnosis catalog --------------------------------------------
    w("-- diagnosis_catalog")
    for d in diagnoses:
        w(
            "insert into public.diagnosis_catalog "
            "(code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)\n"
            "values (\n"
            f"  {q(d['code'])},\n"
            f"  {q(d['label_en'])},\n"
            f"  {q(d['label_es'])},\n"
            f"  {q(d['module'])},\n"
            f"  {q(d['default_map_slug_adult'])},\n"
            f"  {q(d['default_map_slug_pediatric'])},\n"
            f"  {text_array(d['focus_constructs'])}\n"
            ")\n"
            "on conflict (code) do update set\n"
            "  label_en = excluded.label_en,\n"
            "  label_es = excluded.label_es,\n"
            "  module = excluded.module,\n"
            "  default_map_slug_adult = excluded.default_map_slug_adult,\n"
            "  default_map_slug_pediatric = excluded.default_map_slug_pediatric,\n"
            "  focus_constructs = excluded.focus_constructs;"
        )
        w("")

    # ---- construct maps -----------------------------------------------
    w("-- construct_maps (status approved; approved_by null = seeded, not clinician-approved)")
    for m in maps:
        slug = m["slug"]
        version = int(m["version"])
        if (slug, version) not in MAP_IDS:
            raise ValueError(f"no stable id for map {slug}@{version}; add it to MAP_IDS")
        check_facets_and_triage(m)
        ref_slugs = sorted(
            {
                r["instrument"]
                for dom in m["domains"]
                for c in dom["constructs"]
                for r in c["source_refs"]
            }
        )
        unknown = [s for s in ref_slugs if s not in inst_by_slug]
        if unknown:
            raise ValueError(f"{slug}: source_refs reference unknown instruments {unknown}")
        source_ids = [inst_by_slug[s]["id"] for s in ref_slugs]
        map_json = json.dumps(m, ensure_ascii=False, indent=2)
        w(
            "insert into public.construct_maps "
            "(id, slug, version, population, source_instrument_ids, map, status, approved_by, approved_at)\n"
            "values (\n"
            f"  '{MAP_IDS[(slug, version)]}',\n"
            f"  {q(slug)},\n"
            f"  {version},\n"
            f"  {q(m['population'])},\n"
            f"  {uuid_array(source_ids)},\n"
            f"  {q(map_json)}::jsonb,\n"
            "  'approved',\n"
            "  null,\n"
            "  now()\n"
            ")\n"
            "on conflict (slug, version) do update set\n"
            "  population = excluded.population,\n"
            "  source_instrument_ids = excluded.source_instrument_ids,\n"
            "  map = excluded.map,\n"
            "  status = 'approved',\n"
            "  approved_at = coalesce(public.construct_maps.approved_at, now());"
        )
        w("")

    w("commit;")
    w("")
    return "\n".join(out)


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT}")
