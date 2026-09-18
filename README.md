# FACE-Q Conversation

Proof of concept: collecting patient-reported outcomes through natural conversation
instead of a fixed questionnaire. Validated instruments are turned into a
*construct map* (what matters to understand), an LLM has an open conversation in the
patient's language at an age- and literacy-appropriate level, and the result is an
**AI-assisted inferred profile** for the clinician — never a validated instrument
score.

Read [`SPEC.md`](SPEC.md) for the full design. Read this file to get it running.

## What's in the repo

| Path | What |
|---|---|
| `web/` | Vite + React patient and clinician app (GitHub Pages) |
| `supabase/migrations/` | Postgres schema, RLS, views |
| `supabase/seed/` | FACE-Q construct maps (domain-level, no item text), diagnosis catalog, demo data |
| `supabase/functions/` | Edge functions: the conversation engine, profile generation, export, ingestion stub |
| `eval/` | Simulated-patient evaluation harness (Python) |
| `.github/workflows/` | CI, Pages deploy, functions deploy |

## Prerequisites

Accounts you create yourself (nothing here can create them for you):

1. **Anthropic API key** — <https://console.anthropic.com>.
2. **Supabase** — <https://supabase.com>. Create **two** projects: `faceq-dev` and
   `faceq-demo`. Note each project's *Project URL*, *anon key*, *project ref*, and the
   *database connection string* (Settings → Database).
3. **GitHub** — this repo, private.
4. **FACE-Q license** (when you want the real instrument text for ingestion) —
   register at Q-Portfolio. Not needed to run the POC; the shipped construct maps use
   only public scale names and descriptions.

Local tools: Node 22, Deno 2, Supabase CLI, `uv` (Python 3.12). No Docker needed —
development runs against the hosted `dev` project.

## First-time setup (dev project)

```bash
# 1. Link the CLI to your dev project
supabase login
supabase link --project-ref <DEV_PROJECT_REF>

# 2. Apply schema
supabase db push

# 3. Load construct maps, diagnosis catalog, and demo data
psql "<DEV_DATABASE_URL>" -f supabase/seed/seed.sql -f supabase/seed/demo.sql

# 4. Set function secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-5 SAFETY_MODEL=claude-haiku-4-5-20251001 PROMPT_VERSION=1

# 5. Deploy functions
supabase functions deploy

# 6. Create your clinician login
#    Supabase dashboard → Authentication → Users → Add user (email + password or invite).
#    Then in SQL editor:
#    insert into public.clinicians (id, display_name) values ('<auth user id>', 'Dr Demo');
```

Then run the web app locally:

```bash
cd web
cp .env.example .env    # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_FUNCTIONS_URL
npm install
npm run dev
```

Or try it with no backend at all:

```bash
cd web && VITE_MOCK=1 npm run dev
```

## Deploying

- **Web → GitHub Pages**: enable Pages (Settings → Pages → Source: GitHub Actions).
  Add repository *variables* `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_FUNCTIONS_URL`. Pushes to `main` that touch `web/` deploy automatically.
- **Functions → Supabase**: add secret `SUPABASE_ACCESS_TOKEN` (from
  <https://supabase.com/dashboard/account/tokens>) and, per GitHub *environment*
  (`dev`, `demo`), the variable `SUPABASE_PROJECT_ID`. Pushes to `main` deploy to
  `dev`; deploy to `demo` from the Actions tab (workflow dispatch).
- The `demo` project is seeded the same way as `dev` (steps 2–6) but the eval
  harness must never point at it.

## Running the evaluation

See [`eval/README.md`](eval/README.md). Short version:

```bash
cd eval && cp .env.example .env   # dev project URLs, clinician creds, Anthropic key
uv run --project eval python -m faceq_eval run
```

Produces `eval/reports/latest.md` with per-persona and aggregate accuracy.

## Safety and privacy posture (POC)

- No PHI: participants are pseudonymous; age stored as a band.
- Self-harm / abuse / acute-distress language triggers a fixed, pre-translated
  message and halts the session until a clinician reopens it. Two independent
  layers: language-blind patterns, then a small separate model.
- Patient links expire after 14 days.
- The model never gives medical advice; patient questions are routed to the
  clinician's review.
- Every session records prompt version, construct-map version, and model id.
- All clinician reads, exports, deletions, and reopenings are audit-logged.

## License notes

FACE-Q is © McMaster University / Memorial Sloan Kettering Cancer Center and
licensed through Q-Portfolio (Mapi Research Trust). This repository stores **no
FACE-Q item text**; construct maps are paraphrased descriptions of publicly
documented scales. Obtain a license before ingesting the instrument.
