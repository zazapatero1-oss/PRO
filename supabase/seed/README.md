# Seed data

Reference data and demo fixtures for the FACE-Q Conversation database (SPEC §5, §6, §13).

| File | What it is | Load into |
|---|---|---|
| `instruments.json` | The four FACE-Q modules with licence notes. `item_text_stored` is always `false`. | dev, demo |
| `diagnosis_catalog.json` | Diagnosis picklist (`code`, `label_en`/`label_es`, module, default map slugs, `focus_constructs`). | dev, demo |
| `construct_maps/face-q-adult.json` | Approved adult construct map, v1 (33 constructs, 9 domains). | dev, demo |
| `construct_maps/face-q-pediatric.json` | Approved pediatric construct map, v1 (31 constructs, 8 domains). | dev, demo |
| `seed.sql` | **Generated** from the JSON above by `build_seed.py`. Idempotent upserts. | dev, demo |
| `demo.sql` | Three synthetic demo participants with completed sessions (SPEC §13). Re-runnable. | demo only |
| `build_seed.py` | Regenerates `seed.sql`. Standard library only. | – |
| `schema.test.ts` | Deno test that applies migrations + seeds in an in-process Postgres (PGlite) and checks RLS, constraints, view and cascades. | – |

No questionnaire item text from any instrument is stored anywhere in this directory.
Construct descriptions are paraphrased abstractions built from publicly documented
FACE-Q scale names; `source_refs` cite scale names only.

## Load order

1. Migrations (`supabase/migrations/*.sql`) — schema, RLS, view.
2. `seed.sql` — instruments, diagnosis catalog, construct maps (maps depend on
   instrument ids; participants depend on diagnosis codes; sessions depend on map ids).
3. `demo.sql` — only on the `demo` project. Requires step 2.

## Against a hosted Supabase project

```bash
supabase link --project-ref <ref>        # once per environment (dev / demo)
supabase db push                         # applies supabase/migrations
psql "$DATABASE_URL" -f supabase/seed/seed.sql
psql "$DATABASE_URL" -f supabase/seed/demo.sql     # demo project only
```

`DATABASE_URL` is the project's Postgres connection string (Dashboard → Project
Settings → Database; use the session-mode pooler or direct connection, not the
transaction pooler, because the files use transactions and dollar quoting).

Alternatively `supabase db push --include-seed` runs `seed.sql` (configured under
`[db.seed] sql_paths` in `config.toml`); `demo.sql` is intentionally not in that list.

Both files are safe to re-run:

- `seed.sql` upserts by `slug` / `code` / `(slug, version)`. Re-running after editing a
  map JSON updates the map in place (same version). Bump `version` in the JSON when the
  change should be a new map version; sessions keep pointing at the version they used.
- `demo.sql` deletes the three demo participants by fixed id first (everything under
  them cascades), then re-inserts. Study ids are allocated from `next_study_id()`, so
  they advance on each run (P-0001…P-0003 on a fresh database). Demo `audit_log` rows
  are append-only and are not removed.

## Adding a clinician

Clinician access is granted by a row in `public.clinicians` keyed to `auth.users.id`.
After the person has signed in once with a magic link:

```sql
insert into public.clinicians (id, display_name)
select id, 'Dr Example' from auth.users where email = 'clinician@example.org';
```

## Editing reference data

1. Edit the JSON file(s).
2. `python3 supabase/seed/build_seed.py`
3. `deno test -A supabase/seed/schema.test.ts` (needs network on first run to fetch PGlite).
4. Commit the JSON and the regenerated `seed.sql` together.

Quick syntax checks without Postgres:

```bash
for f in supabase/seed/*.json supabase/seed/construct_maps/*.json; do python3 -m json.tool "$f" > /dev/null && echo "ok $f"; done
uv run --python 3.12 --with pglast python -c "import glob,pglast; [pglast.parse_sql(open(f).read()) for f in glob.glob('supabase/**/*.sql', recursive=True)]; print('sql ok')"
```

## Construct map conventions

- Format is SPEC §6. One additive field: `applicable_timepoints` (array of session
  timepoints) on constructs that only make sense after treatment (`recovery.*`,
  `outcome.*`). A construct without it is active at every timepoint. Consumers that do
  not understand the field can ignore it.
- `priority`: `core` constructs (8–10 per map) must be attempted in every session.
- Construct ids are shared across the adult and pediatric maps where the construct is
  the same, so `diagnosis_catalog.focus_constructs` works for both populations. Ids
  that exist in only one map (`aging.appraisal`, `distress.cancer_worry`,
  `function.swallowing_oral`, `social.relationships` adult-only; `appearance.ears`,
  `social.school` pediatric-only) should simply be skipped when absent from the
  session's map.
- For satisfaction-type constructs, `severity` expresses the degree of
  dissatisfaction or concern (`none` = content).
