# FACE-Q Conversation — Product & Technical Specification (v1)

Status: authoritative. Every worker reads this before writing code. If something here is
ambiguous, pick the simplest interpretation consistent with the Principles and note the
choice in your final report. Do not expand scope beyond this document.

---

## 1. Purpose

A proof of concept that collects patient-reported outcomes (PROs) through free,
natural conversation instead of a fixed questionnaire. Validated instruments (initially
the FACE-Q family) are uploaded and converted into a **construct map**: a description
of *what matters to understand about this person* (domains, constructs, severity
signals, and drill-down cues). An LLM (Claude) has an open conversation in the
patient's own language and at an age- and literacy-appropriate register, guided by the
construct map, and extracts structured evidence per construct. When a construct looks
concerning, the model digs deeper. The output is an **inferred profile** for the
clinician: severity per domain with confidence, supporting quotes in the patient's
language, and qualitative drill-down findings.

## 2. Principles (non-negotiable)

1. **Never administer items verbatim.** The instrument is the evidence base for what to
   ask, not a script. Item text from licensed instruments is never stored in the repo
   and never shown to patients.
2. **Honest claims.** Output is an *inferred profile*, never a "FACE-Q score". Labels,
   exports and UI must say "inferred" / "AI-assisted profile".
3. **No medical advice.** If the patient asks "is this normal?" etc., the model
   acknowledges, records it as a `patient_question` finding for the clinician, and does
   not answer clinically.
4. **Safety is deterministic.** Self-harm, abuse, or acute distress triggers a
   hard-coded, pre-translated response and a `safety_flags` row. The model does not
   improvise here.
5. **Patient autonomy.** "Skip", "I'd rather not say", "stop" are honored immediately
   and recorded as declined, not missing. The model does not circle back unprompted.
6. **No PHI in the POC.** Participants are pseudonymous (study-style ID + display name).
   Age is stored as a band. No DOB, contact details, or real names.
7. **Provenance.** Every session records prompt version, construct-map version, and model
   id. Every piece of evidence links to the patient's verbatim words.
8. **API key stays server-side.** Only Supabase Edge Functions call Anthropic.

## 3. Scope

### In v1
- Face page (intake): display name, preferred language, age band, respondent
  (self / guardian / both), reading-comfort, diagnosis (picklist + free text), timepoint.
- Consent screen (adult and minor/guardian variants; en + es).
- Language adaptation (conversation in patient's language; internal map in English;
  verbatim quotes preserved + English gloss).
- Age / literacy register adaptation (static from intake + dynamic from conversation).
- Free conversation with deterministic construct-coverage tracker and tool-based
  evidence extraction.
- Drill-down when a construct's severity crosses threshold.
- Patient control phrases; session length cap with graceful wrap-up.
- Safety intercept with fixed translated messages.
- Session resume via link.
- Longitudinal timepoints; prior-session brief injected into later sessions.
- Clinician focus notes (weight specific constructs for a session).
- Clinician review view: domain severity, quotes, drill-down findings,
  needs-clarification list, transcript, change since prior timepoint.
- Patient-facing editable end-of-session summary (corrections update evidence).
- Export: FHIR bundle (JSON), CSV, printable PDF (client-side render).
- Voice input (browser Web Speech API; swappable interface).
- Prompt + construct-map versioning; audit log; participant deletion.
- Demo mode: seeded synthetic participants with longitudinal sessions.
- Cost logging (tokens per turn/session). Retries with friendly "one moment" state.
- Eval harness: simulated patients with hidden ground truth, en + es.
- Ingestion pipeline **stub**: upload → proposed construct map → requires approval.

### Explicitly out of v1
Scheduling/reminders, multi-tenancy, construct-map editor UI, analytics dashboard,
photo upload, EHR/SMART launch, patient experience rating, third language, local
Supabase (Docker) dev.

## 4. Architecture

```
face-q-conversation/
├── SPEC.md                      this document
├── CLAUDE.md                    conventions for agents
├── web/                         Vite + React + TypeScript SPA → GitHub Pages
├── supabase/
│   ├── config.toml
│   ├── migrations/              SQL, timestamped
│   ├── seed/                    construct maps (JSON), diagnosis catalog, demo data
│   └── functions/
│       ├── _shared/             prompt builder, tracker, safety, anthropic client, db helpers
│       ├── start-session/
│       ├── chat-turn/
│       ├── end-session/
│       ├── confirm-summary/
│       ├── export-session/
│       ├── delete-participant/
│       └── ingest-instrument/   stub
├── eval/                        Python 3.11+, simulated patients, report generator
├── .github/workflows/           deploy-web.yml, deploy-functions.yml, ci.yml
└── README.md
```

- **Frontend**: Vite, React 18, TypeScript, React Router, minimal CSS (no heavy UI
  framework). i18n via a small JSON-per-language dictionary (`en`, `es`). RTL-ready
  layout (dir attribute driven by language) even though v1 languages are LTR.
- **Backend**: Supabase Postgres + Edge Functions (Deno, TypeScript). Anthropic SDK
  for Deno/npm (`npm:@anthropic-ai/sdk`). Streaming via SSE from `chat-turn`.
- **Auth**:
  - Clinicians: Supabase Auth email magic link. A `clinicians` table keyed by
    `auth.users.id` gates access.
  - Patients: **no account**. A session link carries a `resume_token` (random, 32
    bytes, base64url) that **expires 14 days** after creation
    (`sessions.resume_token_expires_at`; error code `token_expired`). Edge functions
    validate the token and use the service role internally. Patients never talk to
    the database directly.
- **RLS**: clinicians can read everything in the tables listed below and write
  `clinician_notes`, `audit_log` (via functions). Anon role has no direct table
  access. All patient-side mutations go through edge functions.
- **Model**: `claude-sonnet-5` default, configured by env `ANTHROPIC_MODEL`. Streaming
  on. Max output tokens per turn 600. Temperature default.
- **Environments**: two hosted Supabase projects, `dev` and `demo`. Web build reads
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL`.
- **Secrets** (Supabase function secrets): `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
  `SAFETY_MODEL` (second safety layer; default `claude-haiku-4-5-20251001`, `off` to
  disable), `SERVICE_ROLE_KEY` (auto), `PROMPT_VERSION`.

## 5. Data model

All tables in schema `public`. `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz default now()` unless stated. Use `text` + check constraints
for enums so migrations stay simple.

### instruments
| column | type | notes |
|---|---|---|
| id | uuid | |
| slug | text unique | e.g. `face-q-aesthetics` |
| name | text | |
| version | text | instrument version as published |
| publisher | text | |
| license_notes | text | free text; required |
| license_url | text | |
| item_text_stored | boolean default false | must stay false for licensed instruments |

### construct_maps
| column | type | notes |
|---|---|---|
| id | uuid | |
| slug | text | e.g. `face-q-adult`, `face-q-pediatric` |
| version | int | increments on change; (slug, version) unique |
| population | text | `adult` / `pediatric` |
| source_instrument_ids | uuid[] | |
| map | jsonb | see §6 format |
| status | text | `draft` / `approved` / `retired` |
| approved_by | uuid null | clinician |
| approved_at | timestamptz null | |

### diagnosis_catalog
| column | type | notes |
|---|---|---|
| id | uuid | |
| code | text unique | e.g. `rhinoplasty`, `cleft-lip-palate`, `hn-cancer`, `skin-cancer-face`, `facelift`, `injectables`, `craniosynostosis`, `microtia`, `other` |
| label_en | text | |
| label_es | text | |
| module | text | `aesthetics` / `craniofacial` / `head-neck-cancer` / `skin-cancer` |
| default_map_slug_adult | text | |
| default_map_slug_pediatric | text | |
| focus_constructs | text[] | construct ids to weight by default |

### participants
| column | type | notes |
|---|---|---|
| id | uuid | |
| study_id | text unique | e.g. `P-0042`, generated |
| display_name | text | what the model calls them; pseudonym allowed |
| preferred_language | text | BCP-47: `en`, `es` |
| age_band | text | `under-8`, `8-12`, `13-17`, `18-29`, `30-49`, `50-69`, `70-plus` |
| reading_comfort | text | `short-messages`, `comfortable`, `prefer-voice` |
| diagnosis_code | text references diagnosis_catalog(code) | |
| diagnosis_text | text | free text as entered |
| is_demo | boolean default false | |
| deleted_at | timestamptz null | soft delete; hard delete function purges |

### sessions
| column | type | notes |
|---|---|---|
| id | uuid | |
| participant_id | uuid references participants | |
| timepoint | text | `baseline`, `pre-op`, `post-op-2w`, `post-op-6w`, `post-op-6m`, `post-op-12m`, `follow-up` |
| respondent | text | `self`, `guardian`, `both` |
| language | text | actual conversation language (may differ from preferred if patient switches) |
| construct_map_id | uuid references construct_maps | |
| prompt_version | text | |
| model_id | text | |
| status | text | `intake`, `consented`, `active`, `wrapping-up`, `summary-review`, `completed`, `abandoned`, `safety-halted` |
| resume_token_hash | text | sha256 of token; token itself never stored |
| max_turns | int default 40 | session cap (assistant turns) |
| target_minutes | int default 12 | |
| started_at / ended_at | timestamptz | |
| consent_given_at | timestamptz null | |
| consent_variant | text null | `adult`, `minor-assent`, `guardian` |
| input_tokens / output_tokens | int default 0 | running totals |
| cost_usd_estimate | numeric null | computed from a price table in config; nullable |

### clinician_notes
| session_id, clinician_id, note text, focus_constructs text[] |

### messages
| column | type | notes |
|---|---|---|
| id | uuid | |
| session_id | uuid | |
| seq | int | ordering; (session_id, seq) unique |
| role | text | `patient`, `assistant`, `system-event` |
| content | text | |
| input_mode | text null | `text`, `voice` (patient only) |
| tokens_in / tokens_out | int null | assistant turns |
| latency_ms | int null | |

### construct_evidence
| column | type | notes |
|---|---|---|
| id | uuid | |
| session_id | uuid | |
| construct_id | text | from the map, e.g. `psych.self_consciousness` |
| message_id | uuid | the patient message the evidence came from |
| patient_quote | text | verbatim, patient's language |
| quote_gloss_en | text | English gloss (same as quote if en) |
| severity | text | `none`, `mild`, `moderate`, `severe`, `unclear`, `declined` |
| confidence | numeric | 0–1 |
| interference | text[] | e.g. `social`, `work`, `school`, `sleep`, `relationships`, `daily-activities` |
| note | text null | model's short rationale |
| superseded_by | uuid null | when a later correction replaces it |

### probe_findings
| id, session_id, construct_id, finding text, category text (`onset`, `trajectory`, `triggers`, `relief`, `impact`, `expectation`, `patient_question`, `other`), message_id |

### session_profiles
| column | type | notes |
|---|---|---|
| session_id | uuid pk | |
| profile | jsonb | see §8 |
| patient_summary | text | in patient's language |
| patient_summary_confirmed_at | timestamptz null | |
| patient_corrections | jsonb null | |
| generated_at | timestamptz | |

### safety_flags
| id, session_id, message_id, trigger text (`self_harm`, `abuse`, `acute_distress`, `other`), detected_by text (`keyword`, `model`), action_taken text, reviewed_by uuid null, reviewed_at |

### audit_log
| id, actor_type (`clinician`, `participant`, `system`), actor_id text, action text, target_type text, target_id text, metadata jsonb, created_at |

### clinicians
| id (= auth.users.id), display_name, created_at |

### Views / RPC
- `v_participant_timeline`: participant with sessions ordered by timepoint + profile
  summary per session (for the clinician list and change view).

## 6. Construct map format (jsonb)

```json
{
  "slug": "face-q-adult",
  "version": 1,
  "population": "adult",
  "language": "en",
  "domains": [
    {
      "id": "appearance",
      "label": "Satisfaction with facial appearance",
      "weight": 1.0,
      "constructs": [
        {
          "id": "appearance.overall",
          "label": "Overall satisfaction with how the face looks",
          "description": "How the person feels about their facial appearance as a whole, in the mirror, in photos, and in how it fits their age.",
          "severity_signals": {
            "none": "content or positive about appearance",
            "mild": "occasional dissatisfaction, no avoidance",
            "moderate": "regular dissatisfaction; some avoidance (photos, mirrors)",
            "severe": "persistent distress; avoidance affecting daily life"
          },
          "drill_down": ["Which features bother them most", "Situations where it is worse (photos, video calls, bright light)", "How long they have felt this way", "What they hope will change"],
          "age_variants": {
            "pediatric": {
              "description": "How the child feels about their face at school, with friends, in photos.",
              "drill_down": ["Teasing or comments from others", "Whether they avoid activities"]
            }
          },
          "priority": "core",
          "source_refs": [{"instrument": "face-q-aesthetics", "scale": "Satisfaction with Facial Appearance Overall"}]
        }
      ]
    }
  ],
  "coverage_rules": {
    "min_confidence_to_count": 0.6,
    "drill_down_threshold": "moderate",
    "core_constructs_required": true,
    "max_constructs_per_session": 18
  }
}
```

- `priority`: `core` (must attempt) / `standard` / `optional`.
- `source_refs` reference scale *names* only — never item text.
- Two seed maps are shipped: `face-q-adult` and `face-q-pediatric`, built from
  **publicly documented** FACE-Q scale names and descriptions. Cover at least these
  domains: appearance (overall + key features: nose, eyes, lips, cheeks, chin/jawline,
  skin, smile/teeth where relevant), psychological function, social function,
  appearance-related distress, facial function (breathing, eating/drinking, speaking,
  facial expression — mainly craniofacial / head & neck), adverse effects (swelling,
  bruising, numbness, scarring, asymmetry, pain), recovery/early life impact,
  satisfaction with outcome / decision / information (only for post-op timepoints),
  age appraisal (aesthetics only). Roughly 25–35 constructs per map. Diagnosis
  `focus_constructs` narrows which are active for a session (max 18).

## 7. Conversation engine (`chat-turn`)

### 7.1 Session state (computed each turn, not trusted to the model)
From `construct_evidence` and `probe_findings`, compute per active construct:
`status ∈ {untouched, partial, covered, declined, needs_clarification, drill_down_pending, drill_down_done}`.
- `covered`: ≥1 evidence row with confidence ≥ `min_confidence_to_count` and
  severity ≠ `unclear`.
- `needs_clarification`: evidence exists but all below threshold, or conflicting
  severities (≥2 levels apart) not superseded.
- `drill_down_pending`: covered with severity ≥ `drill_down_threshold` and no
  probe_findings yet (or fewer than 2).
- Clinician `focus_constructs` are listed first and marked `[FOCUS]`.

### 7.2 System prompt composition (in `_shared/prompt.ts`)
Sections, in order:
1. Role and principles (fixed text; §2 rules restated for the model).
2. Register profile: language, age band, reading comfort, respondent → concrete
   instructions (sentence length, vocabulary, tone, who is being addressed). Include
   the rule: *adapt dynamically — if replies are short or confused, simplify; if
   fluent, meet them there.* Never use medical jargon unless the patient does.
3. Patient context: display name, diagnosis (label in patient language), timepoint,
   and — for non-baseline sessions — a **prior-session brief** (≤200 words: previous
   profile summary per domain + notable quotes), with instruction to reference change
   naturally.
4. Clinician focus note (if any).
5. Construct map: only the *active* constructs, rendered compactly (id, label,
   description, severity signals, drill-down cues, age variant applied).
6. Coverage status block (from 7.1) with explicit next-step guidance:
   "Prioritise: FOCUS → needs_clarification → drill_down_pending → untouched core →
   untouched standard. Weave, don't interrogate. One topic per message. Max ~2
   questions per message."
7. Turn budget: turns used / max, minutes elapsed / target. At ≥80% of either:
   "Begin wrapping up; do not open new topics." At 100%: call `end_session`.
8. Tool usage rules (below) and control-phrase handling.

**Ordering for prompt caching.** Sections 1–5 and 8 are identical for every turn of
a session and are sent as one cached system block; sections 6–7 (coverage, budget,
per-turn notes) change every turn and are sent last as a separate uncached block.
For `needs_clarification` constructs the guidance is to reflect back and check once
more in conversation before leaving the item for the clinician.

### 7.3 Tools (Anthropic tool use)
- `record_evidence({construct_id, patient_quote, quote_gloss_en, severity, confidence, interference[], note})`
  — call whenever a patient message provides evidence, possibly several times per turn.
- `record_probe_finding({construct_id, category, finding})`
- `mark_declined({construct_id, reason})`
- `raise_safety_flag({trigger, rationale})` — model-side detection; the deterministic
  keyword pass runs *before* the model regardless.
- `end_session({reason: "coverage_complete" | "turn_budget" | "patient_requested"})`

Tool calls execute server-side against the DB, then the model's text is streamed.
Use a single Anthropic call per turn with tools + text; loop on tool results up to
3 rounds.

### 7.4 Safety intercept
`_shared/safety.ts`: keyword/regex lists (en, es) for self-harm, abuse, acute
distress. **Every language's patterns run on every message** regardless of the
session language, so a mid-conversation language switch cannot dodge detection.
Runs on every patient message **before** the model call. When the pattern layer is
silent, a second independent layer (`_shared/safety_classifier.ts`, a small model
configured by `SAFETY_MODEL`) screens the message with recent context; it fails open
on any error so the pattern layer remains the floor. Flags record `detected_by`
(`keyword` / `model`).
On hit: insert `safety_flags` (detected_by `keyword`), set session status
`safety-halted`, return the fixed message for that language from
`_shared/safety_messages.ts` (reviewed static text, includes region-agnostic
guidance to contact local emergency services / a trusted adult for minors, and that
the care team will be notified). No further model turns until a clinician reopens
the session (v1: manual DB flip; expose a clinician "reopen" button).
Model-raised flags (`raise_safety_flag`) do the same after the current turn.

### 7.5 Control phrases
Deterministic detection (en/es) of skip / rather-not / stop / pause. Skip and
rather-not → the *current* construct(s) referenced in the last assistant message are
`mark_declined`. Stop → `end_session(patient_requested)` and move to summary.
Pause → status `active` retained; return resume instructions.

### 7.6 Streaming contract
`POST /functions/v1/chat-turn` body `{session_id, resume_token, text, input_mode}`.
Response: `text/event-stream`. Events:
- `event: token` `data: {"t": "..."}`
- `event: evidence` `data: {construct_id, severity, confidence}` (for subtle UI hint)
- `event: status` `data: {coverage: {covered, total_active}, turns_used, max_turns}`
- `event: safety` `data: {message}` (terminal)
- `event: ended` `data: {reason}` (terminal; client then calls end-session flow)
- `event: error` `data: {retryable: bool, message}`
Retries: the client retries a failed turn once after 2 s, showing "one moment…".

### 7.7 Session lifecycle
`start-session` → status `intake`; consent → `consented`; first `chat-turn` →
`active`. The assistant sends the opening message (generated) when status becomes
`active`; the client requests it by calling `chat-turn` with `text: null`.
`end-session` generates the profile (§8) and the patient summary, sets
`summary-review`. `confirm-summary` applies corrections (each correction creates a
new `construct_evidence` row and sets `superseded_by` on the old one) and sets
`completed`.

## 8. Profile generation (`end-session`)

One non-streaming Anthropic call with the full evidence + findings, producing JSON:
```json
{
  "generated_with": {"model": "...", "prompt_version": "...", "map": "face-q-adult@1"},
  "domains": [{
    "id": "psychological", "label": "...",
    "severity": "moderate", "confidence": 0.72,
    "summary_en": "...", "constructs": [{
      "id": "...", "severity": "...", "confidence": 0.8,
      "quotes": [{"text": "...", "lang": "es", "gloss_en": "..."}],
      "findings": [{"category": "impact", "text": "..."}],
      "status": "covered"
    }]
  }],
  "needs_clarification": [{"construct_id": "...", "reason": "..."}],
  "not_covered": ["..."], "declined": ["..."],
  "patient_questions": ["..."],
  "change_from_prior": [{"construct_id": "...", "prior": "severe", "now": "moderate", "note": "..."}],
  "disclaimer": "AI-assisted inferred profile. Not a validated FACE-Q score."
}
```
Domain severity = worst covered construct severity, unless ≥2 constructs; then use
the median with worst noted. (Simple and explainable; document it in the UI tooltip.)

`patient_summary`: ≤150 words, patient's language, register-adapted, structured as
"what I heard" bullets per domain in plain words, ending with "Did I get this right?
You can correct anything." No severity labels shown to patients.

## 9. Web app pages

- `/` — landing: two buttons: "I have a link" (patient) / "Clinician sign in".
- `/p/:token` — patient flow: language picker (en/es) → consent → face page
  (prefilled if participant exists) → chat → summary review → thank-you.
  Chat: text input, mic button (Web Speech API, language set from session), a
  read-aloud toggle (browser speech synthesis, per-viewer preference) that speaks each
  completed assistant message, streaming assistant bubbles, subtle coverage progress ("we've talked about 6 of 9 areas"),
  "skip" and "take a break" buttons, resume on reload.
- `/clinician` — magic-link sign in. List of participants (study_id, diagnosis,
  timepoints completed, last session status, flags).
- `/clinician/participant/:id` — timeline; "new session" (choose timepoint, respondent,
  focus note) generates a patient link (shown once; token not stored).
- `/clinician/session/:id` — review view: domain severity tiles, construct list with
  quotes (original + gloss), findings, needs-clarification list, safety flags with
  reopen, transcript, change vs prior, export buttons (FHIR JSON, CSV, PDF via
  print stylesheet), delete participant (confirm).
- `/clinician/instruments` — list; upload (stub) → shows proposed map JSON → approve.

i18n: all UI strings in `web/src/i18n/{en,es}.json`. Document `dir` attribute set
from language.

## 10. Export (`export-session`)

`GET ?session_id&format=fhir|csv` (clinician auth).
- **FHIR R4** `Bundle` (type `collection`): `Patient` (pseudonymous, id = study_id),
  `Encounter` (session), one `Observation` per covered construct
  (`code.text` = construct label; `valueCodeableConcept` = severity; `note` = quotes;
  `extension` confidence), one `Composition` with the narrative profile, and
  `Flag` resources for safety flags. Do **not** emit `QuestionnaireResponse`.
- **CSV**: one row per construct: study_id, timepoint, domain, construct, severity,
  confidence, quote, gloss, findings (joined), status.
- **PDF**: client-side print view of the review page.

## 11. Ingestion stub (`ingest-instrument`)

Accepts `{instrument_slug, text}` (extracted text pasted or uploaded as .txt in v1),
calls the model with an extraction prompt that outputs a *proposed* construct map in
§6 format **without copying item text** (descriptions must be paraphrased
constructs), stores it as `construct_maps.status = draft`, returns it. Approval sets
`approved`. No PDF parsing in v1.

## 12. Eval harness (`eval/`)

Python 3.11+, `httpx`, `anthropic`, `pydantic`, `rich`. No framework.
- `personas/*.yaml`: ≥8 personas across en/es, adult/pediatric(with guardian),
  diagnoses, each with hidden ground truth per construct (severity + a few
  narrative facts) and a personality (terse, chatty, evasive, switches language
  mid-way, asks medical questions, mentions self-harm [1 persona, to test intercept]).
- `run.py`: for each persona, creates participant/session via edge functions,
  plays the patient with a separate Claude call (persona prompt), until `ended`.
- `score.py`: compares profile vs ground truth: per-construct severity agreement
  (exact / within-1), coverage rate, needs-clarification rate, declined handling,
  safety intercept correctness, turns, duration, tokens, cost.
- `report.py`: Markdown + JSON report in `eval/reports/`.
- Runs against the `dev` environment via env vars. Never against `demo`.

## 13. Cross-cutting

- **Versioning**: `PROMPT_VERSION` env string; prompt files carry a header comment
  with the version. Construct map version from DB. Both stamped on `sessions`.
- **Audit**: every clinician read of a session/profile, export, reopen, delete;
  every participant consent, summary confirmation. Written by edge functions.
- **Deletion**: `delete-participant` hard-deletes participant and all dependent rows
  (cascade) and writes one audit row with the study_id only.
- **Cost**: per-turn tokens on `messages`; session totals on `sessions`; price table
  in `_shared/config.ts` (values configurable; leave placeholders with a comment to
  fill from the current price list).
- **Demo mode**: `supabase/seed/demo.sql` creates 3 participants (en adult
  rhinoplasty with baseline + post-op-6w; es adult facelift baseline; en pediatric
  cleft with guardian, baseline) with plausible messages, evidence, findings and
  profiles. `is_demo = true`.
- **Errors**: functions return `{error: {code, message, retryable}}` with proper
  status codes; never leak stack traces.
- **Tests**: Deno tests for tracker, safety, control phrases, prompt builder; Vitest
  for web utilities; pytest for eval scoring. CI runs all three.

## 14. Definition of done (demo script, ≤10 minutes, from a phone)

1. Clinician signs in, sees demo participants and a baseline profile.
2. Creates a new post-op session for the Spanish participant, opens the patient link,
   completes consent + face page in Spanish, has a ~5-minute conversation using voice
   at least once, skips one topic, receives and corrects the summary.
3. Clinician view shows the new profile, quotes in Spanish with English gloss,
   drill-down findings, needs-clarification list, and change vs baseline.
4. Exports FHIR and CSV; prints PDF.
5. `eval/reports/latest.md` shows accuracy across ≥8 personas in en + es, including a
   correctly intercepted safety persona.

## 15. Workstreams (for the manager)

| # | Workstream | Depends on | Deliverables |
|---|---|---|---|
| A | Database: migrations, RLS, views, seed maps, diagnosis catalog, demo data | — | `supabase/migrations`, `supabase/seed` |
| B | Edge functions + shared lib + Deno tests | §5–§8, §10–§11 contracts (not A's code) | `supabase/functions` |
| C | Web app + i18n + voice + print/PDF + Vitest | §7.6, §9 contracts | `web/` |
| D | Eval harness + pytest | §7.6, §8, §12 | `eval/` |
| E | CI/CD workflows + README setup guide | A–D | `.github/`, `README.md` |

Workers A–D run in parallel against the contracts in this document. Column names,
event names, tool names and JSON shapes in this spec are binding; if a worker must
deviate, it documents the deviation at the top of its final report.
