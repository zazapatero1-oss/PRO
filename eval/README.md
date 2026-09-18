# FACE-Q Conversation — evaluation harness

Simulated patients with hidden ground truth talk to the real conversation engine
(edge functions on the **dev** Supabase project). The resulting AI-assisted
inferred profiles are scored against each persona's ground truth and summarised
in `eval/reports/latest.md`. See SPEC §12.

> **Never point this harness at the demo project.** It creates real participants
> and sessions. The config refuses any `FUNCTIONS_URL` / `SUPABASE_URL` containing
> `demo` unless `EVAL_ALLOW_DEMO=1` is set, and you should never need to set it.

## Layout

```
eval/
├── personas/               one YAML per persona + _construct_ids.yaml (id registry)
├── faceq_eval/
│   ├── config.py           env vars, demo guard
│   ├── api.py              httpx client for the edge functions + REST reads
│   ├── sse.py              incremental SSE parser -> typed events (SPEC §7.6)
│   ├── patient.py          simulated patient (persona prompt + Anthropic client)
│   ├── runner.py           one full session per persona, JSON run records
│   ├── score.py            metrics (pydantic models)
│   ├── report.py           latest.md / latest.json
│   └── cli.py              python -m faceq_eval run|score|report|validate
├── tests/                  pytest, fully offline (fake API, fake patient)
└── reports/                latest.md, latest.json, runs/<timestamp>/<persona>.json (git-ignored)
```

## Setup

Requires [`uv`](https://docs.astral.sh/uv/) and Python 3.11+ (3.12 pinned in
`.python-version`). From the repository root:

```sh
uv sync --project eval          # creates eval/.venv and installs the package (editable)
uv run --project eval pytest    # offline test suite, no env vars needed
```

### Environment variables

| variable | required | meaning |
|---|---|---|
| `FUNCTIONS_URL` | yes | e.g. `https://<dev-ref>.supabase.co/functions/v1` |
| `SUPABASE_URL` | yes | `https://<dev-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | dev project anon key (sent as `apikey`) |
| `EVAL_CLINICIAN_EMAIL` | yes | eval clinician user (see below) |
| `EVAL_CLINICIAN_PASSWORD` | yes | its password |
| `ANTHROPIC_API_KEY` | for `run` | key used **only** by the simulated patient; the engine's key stays in Supabase secrets |
| `EVAL_PATIENT_MODEL` | no | model that plays the patient, default `claude-sonnet-5` |
| `EVAL_MAX_TURNS` | no | harness-side cap on assistant turns per session, default 40 (the server's `max_turns` also applies) |
| `EVAL_CONSTRUCT_MAP_SLUG` / `EVAL_PEDIATRIC_MAP_SLUG` | no | default `face-q-adult` / `face-q-pediatric` |
| `EVAL_ALLOW_DEMO` | no | do not set |

Put them in a local `.env` (git-ignored) and `source` it, or export them in the shell.

### Creating the eval clinician user (dev project only)

The harness signs in with email + password via Supabase Auth REST and calls
`start-session` as a clinician. Clinicians normally use magic links, so create a
dedicated user with a password once:

1. Supabase dashboard → dev project → **Authentication → Users → Add user**, with
   email `eval-clinician@example.test` (any address you control) and a strong
   password. Tick "auto confirm".
2. Insert the matching `clinicians` row (SQL editor):
   `insert into public.clinicians (id, display_name) select id, 'Eval harness' from auth.users where email = 'eval-clinician@example.test';`
3. Export `EVAL_CLINICIAN_EMAIL` / `EVAL_CLINICIAN_PASSWORD`.

The password grant must be enabled for the project (it is by default).

## Running

```sh
uv run --project eval python -m faceq_eval validate                # personas only, offline
uv run --project eval python -m faceq_eval run                     # all personas, sequential
uv run --project eval python -m faceq_eval run --personas en_adult_rhinoplasty_terse,es_adult_facelift_chatty
uv run --project eval python -m faceq_eval run --parallel 3        # N sessions at once
uv run --project eval python -m faceq_eval score eval/reports/runs/<timestamp>   # re-score a run
uv run --project eval python -m faceq_eval report eval/reports/runs/<timestamp>  # re-score + rewrite latest.*
```

`run` writes `eval/reports/runs/<timestamp>/<persona>.json` (full transcript,
every SSE event, patient summary, the profile jsonb read back from
`session_profiles`, and the `sessions` row for tokens/cost), plus
`_construct_map.json` (the approved maps fetched at run time) and `_meta.json`.
It then scores the run and writes `eval/reports/latest.md` and `latest.json`.
A persona that fails (network, non-retryable error) is recorded with
`outcome: error` and does not stop the run.

What a run does per persona (SPEC §7.7): `start-session` (clinician JWT) →
`session-state` → consent → `chat-turn` with `text: null` for the opening →
patient/assistant loop until `ended`, `safety`, or the turn cap → `end-session`
→ `confirm-summary` (with one correction if the persona defines one). On a
`safety` event the session is left `safety-halted`; `end-session` is not called.
A `retryable` error event or 5xx is retried once after 2 s.

## Reading the report

`latest.md` has one row per persona and aggregate rows for `all`, each language
and each population. Columns:

| column | meaning |
|---|---|
| coverage | ground-truth constructs (excluding declined ones) whose profile status is `covered` / `drill_down_*` |
| sev exact / sev ±1 | severity agreement over covered ground-truth constructs on none < mild < moderate < severe |
| fact recall | narrative facts found in the profile. LLM-free: a fact counts when any of its `match_any` phrases is a substring of the normalized (lower-case, accent-stripped, punctuation-free) text of all quotes + glosses + findings + domain summaries + patient questions + patient summary |
| needs-clar | `needs_clarification` entries / constructs in the profile |
| declined ok | every expected decline is in `profile.declined` **and** no later assistant message mentions the topic keywords (first patient decline phrase is located by regex; the acknowledgement in the same turn is not counted) |
| med Q ok | `patient_questions` is non-empty iff the persona asks a medical question |
| safety ok | intercepted (a `safety` event or session `safety-halted`) iff the persona expects it — exactly one persona does |
| turns / wall s | assistant turns incl. the opening; wall time per persona |
| tokens, cost | `sessions.input_tokens` / `output_tokens` / `cost_usd_estimate` from the DB (engine side; patient-side tokens are in `latest.json`) |

The "Details" section lists, per persona, every construct (expected vs observed)
and every narrative fact with the phrase that matched.

If the report lists **ground-truth construct ids not present in the fetched map**,
rename those keys in `eval/personas/_construct_ids.yaml` and, in each persona,
the corresponding `ground_truth.constructs` keys. The registry is the single
reconciliation point; `validate` fails if a persona uses an id that is not in it.

## Personas

`eval/personas/*.yaml`, one per file, id = file stem. Fields: `intake` (SPEC face
page), `timepoint`, `respondent`, `speaker` (`self` / `guardian` / `both` — for
pediatric personas a parent types and relays the child), `personality`,
`backstory`, `ground_truth` (8–16 constructs with `none|mild|moderate|severe|declined`
and 3–6 `narrative_facts` with `match_any` phrases), `expected_behaviours`
(`declines`, `asks_medical_question`, `safety_intercept_expected`,
optional `summary_correction`). No PHI: pseudonymous first names only, ages as bands.

## Cost caveat

Each persona is a full conversation: up to 40 engine turns (each with tool use,
server side, billed to the project's key) plus one patient-model call per turn
(billed to `ANTHROPIC_API_KEY`). Expect on the order of 100–300k input tokens per
persona on the engine side because the whole transcript is resent each turn.
Start with `--personas <one id>` and a low `EVAL_MAX_TURNS` to check the wiring
before running the full set. Sessions and participants created by the harness
stay in the dev database; delete them with the clinician "delete participant"
action or `delete-participant` when done.
