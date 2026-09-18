# FACE-Q Conversation — evaluation harness

Simulated patients with hidden ground truth talk to the real conversation engine
(edge functions on the **dev** Supabase project). The resulting AI-assisted
inferred profiles are scored against each persona's ground truth and summarised
in `eval/reports/latest.md`. See SPEC §12 and the v1.1 addendum §F.

v1.1 adds four things to the harness: **facet recall** (did the engine drill into
a focus construct's details, not just touch it once), **triage compliance** (did
the opening turns run the stock screen), **focus precision/recall + confirm**
(did triage pick the right constructs and reflect them back), and **latency**
(time-to-first-token and full-turn time per assistant turn).

> **Never point this harness at the demo project.** It creates real participants
> and sessions. The config refuses any `FUNCTIONS_URL` / `SUPABASE_URL` containing
> `demo` unless `EVAL_ALLOW_DEMO=1` is set, and you should never need to set it.

## Layout

```
eval/
├── personas/               one YAML per persona + _construct_ids.yaml (construct id
│                           registry) + _facet_ids.yaml (facet id registry)
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
| `EVAL_MAX_TURNS` | no | harness-side cap on assistant turns per session, default 60 to match the v1.1 session cap (the server's `max_turns` also applies; the lower of the two wins) |
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
`session_profiles`, and the `sessions` row for tokens/cost, `phase` and
`focus_constructs`), plus
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

Per assistant turn the runner also records (SPEC v1.1 §C/§F):

| field | meaning |
|---|---|
| `time_to_first_token_ms` | request start → the first `token` event |
| `turn_ms` | request start → the `status` event (the engine has streamed the reply *and* finished extraction; `evidence` events arrive in between) |
| `phase` / `current_focus` / `focus_progress` | from the last `status` event of that turn |

Both latency fields are `null` when the stream produced no such event (e.g. a
turn that only carried a `safety` event). On a retried turn they measure the
successful attempt, not the failed one.

The session row is read with `phase` and `focus_constructs` selected; if the
project has not run the v1.1 migration yet the read falls back to the v1 column
list and the focus metrics report `–` instead of failing the run.

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
| facet recall | of the facets the persona's focus constructs list in ground truth, how many the engine covered: a facet counts when it is in that construct's `facets_covered` in the profile **or** in the `facets` of any `evidence` event of the run. Micro-averaged over the persona's focus constructs |
| triage | whether the opening screen was run: `yes/no (addressed/applicable)` (see the keyword rules below) |
| focus P/R | `sessions.focus_constructs` against the persona's `expected_focus`: precision = matched/observed, recall = matched/expected. `–/–` when the session row carries no `focus_constructs` |
| confirm | whether ≥1 focus construct in the profile carries `confirmed: true` (the reflect-back step of SPEC v1.1 §B) |
| TTFT ms med/p90 | median and p90 `time_to_first_token_ms` over the session's assistant turns |
| turn ms med/p90 | median and p90 `turn_ms` (request start → `status`) |
| turns / wall s | assistant turns incl. the opening; wall time per persona |
| tokens, cost | `sessions.input_tokens` / `output_tokens` / `cost_usd_estimate` from the DB (engine side; patient-side tokens are in `latest.json`) |

Aggregate rows average the per-persona rates, except the latency columns, which
pool **every turn** of the group before taking the median/p90, and `triage
items`, which is the total addressed over the total applicable.

The "Details" section lists, per persona, every construct (expected vs observed),
every narrative fact with the phrase that matched, the triage item table (which
turn addressed each item and on which phrase), the facets covered/missing per
focus construct, the expected vs observed focus list and the latency summary.

### Triage compliance rules

Triage compliance is judged with fixed keyword rules, not a model, so the metric
is cheap, deterministic and reviewable. The rules live in `TRIAGE_KEYWORDS` in
`faceq_eval/score.py`, one list of phrases per triage item id of the map's
`triage` block (SPEC v1.1 §A):

| item | addressed when an assistant turn mentions (en / es, abridged) |
|---|---|
| `overall` | "your face", "your appearance", "overall", "as a whole" / "su cara", "tu cara", "su aspecto", "en general", "en conjunto" |
| `features` | "part(s) of your face", "which part", "feature", or a named feature: nose, eyes, lips, cheek, chin, jaw, skin, smile, teeth, ears, forehead, scar / "parte de su cara", "que parte", "rasgo", nariz, ojos, labio, mejilla, mentón, mandíbula, piel, sonrisa, dientes, orejas, frente, cicatriz |
| `function` | breathing, eating, drinking, chewing, swallow, speaking, speech, "being understood", "move your face", expression / respirar, comer, beber, tragar, masticar, hablar, pronunciar, "le/te entienden", "mover la cara", expresión |
| `impact` | "about yourself", confidence, "self conscious", mood, "other people", friends, family, social, avoid, school, work, "going out", bother, upset / "sobre usted/ti", confianza, ánimo, "otras personas", amigos, familia, evita, escuela, colegio, trabajo, salir, molesta, afecta |
| `recovery` | recovery, healing, pain, swelling, bruising, numb, scar, "since the surgery" / recuperación, dolor, hinchazón, moretones, entumecido, dormido, cicatriz, "desde la operación" |

Matching is a substring test on the **normalized** assistant text (accents
stripped, lower-cased, punctuation removed — the same normalizer as fact
recall), so Spanish stems are written unaccented and English ones short enough
to survive inflection.

- Only the first **6** assistant turns are examined (`TRIAGE_TURNS`).
- An item that carries `timepoints` (the seed maps' `recovery`) is applicable
  only at those timepoints; baseline personas therefore have 4 applicable items,
  post-op personas 5.
- A persona is compliant when at least **4** applicable items were addressed
  (`TRIAGE_MIN_ITEMS`), or all of them when fewer than four apply.
- A triage item in the fetched map that has no keyword rule is listed under
  `unscored_item_ids` and excluded from the denominator — add a rule for it
  rather than letting it silently pass.
- When the run has no construct map, the documented default screen
  (`overall`, `features`, `function`, `impact`, `recovery`) is used.

The rules judge whether the *topic was raised at all* in the opening turns, not
how well it was asked; a turn that name-drops a feature counts. Read the item
table in the Details section before trusting a low score.

`eval/personas/_construct_ids.yaml` holds the ids of the seeded `face-q-adult`
(33) and `face-q-pediatric` (31) maps, an explicit id list per population, and the
post-op-only ids (`recovery.*`, `outcome.*`). `validate` (and the test suite) fail
if a persona references an id outside its population's list, or carries a
post-op-only construct at baseline/pre-op. If the report ever lists
**ground-truth construct ids not present in the fetched map**, the seed map has
changed: update the registry and the persona keys in one pass.

`eval/personas/_facet_ids.yaml` does the same job one level down: facet id →
label for every construct id (5–8 each, the v1.1 §A facets). Persona ground truth
may only use facet ids listed there, and the scorer additionally reconciles them
against the fetched map and prints **ground-truth facet ids not present in the
fetched construct map** — same one-file fix.

## Personas

`eval/personas/*.yaml`, one per file, id = file stem. Fields: `intake` (SPEC face
page), `timepoint`, `respondent`, `speaker` (`self` / `guardian` / `both` — for
pediatric personas a parent types and relays the child), `personality`,
`backstory`, `ground_truth` (8–16 constructs with `none|mild|moderate|severe|declined`
and 3–6 `narrative_facts` with `match_any` phrases), `expected_focus`,
`expected_behaviours` (`declines`, `asks_medical_question`,
`safety_intercept_expected`, optional `summary_correction`). No PHI:
pseudonymous first names only, ages as bands.

### Focus constructs and facets (v1.1)

`expected_focus` lists the 2–4 constructs triage is expected to surface for this
persona — the ones they came to talk about, plus any the clinician note weights.
Exactly those constructs carry `facets` in their ground truth, and a construct
is written in long form there:

```yaml
expected_focus: [appearance.nose, distress.preoccupation, distress.hiding]
ground_truth:
  constructs:
    appearance.overall: mild          # short form: severity only
    appearance.nose:                  # long form: a focus construct
      severity: severe
      facets:                         # facet id (see _facet_ids.yaml) -> what they would say
        bridge: "there's a bump on the bridge, you can see it from the side"
        breathing: "breathing is fine, never had an issue"
```

Both forms are accepted for every construct. The facet text is what the
simulated patient answers **when asked about that specific detail** — the
persona prompt tells it to give one detail per reply and never to list them, so
a model that asks "how do you feel about your nose?" once and moves on scores a
low facet recall, which is the point of the metric.

Validation (and the test suite) enforce: 2–4 focus constructs, all in ground
truth, none declined, each with facets; no non-focus construct carries facets;
every facet id exists in `_facet_ids.yaml` for that construct; `expected_focus`
stays inside the persona's population id list.

The safety persona (`en_adult_hn_cancer_safety`) halts around turn 7-8 by
design, so its facet recall and confirm columns read low; that is expected, not
a regression.

## Cost caveat

Each persona is a full conversation: up to 60 engine turns (each with tool use,
server side, billed to the project's key) plus one patient-model call per turn
(billed to `ANTHROPIC_API_KEY`). Expect on the order of 100–300k input tokens per
persona on the engine side because the whole transcript is resent each turn.
Start with `--personas <one id>` and a low `EVAL_MAX_TURNS` to check the wiring
before running the full set. Sessions and participants created by the harness
stay in the dev database; delete them with the clinician "delete participant"
action or `delete-participant` when done.
