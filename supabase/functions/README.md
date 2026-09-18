# Edge functions (Workstream B)

Deno + TypeScript, strict. Every function is `index.ts` (wiring only) + `handler.ts` (logic with
injected `Db` / `AnthropicClientLike` / `AuthClient`), so the whole thing is unit-testable offline.
Shared code lives in `_shared/`.

## Local checks

```sh
cd supabase/functions
deno task check   # type-checks _shared + every index.ts
deno task test    # 165 tests, no network, no API key needed
deno lint && deno fmt --check
```

## Deploy

The import map is `supabase/functions/deno.json` (also mirrored in `import_map.json` for CLIs that
only read that file). From the repo root:

```sh
# patient-side functions authenticate with the resume token, not a JWT
supabase functions deploy start-session   --no-verify-jwt
supabase functions deploy session-state   --no-verify-jwt
supabase functions deploy chat-turn       --no-verify-jwt
supabase functions deploy end-session     --no-verify-jwt
supabase functions deploy confirm-summary --no-verify-jwt

# clinician-only functions keep the gateway JWT check AND re-check `clinicians` themselves
supabase functions deploy export-session
supabase functions deploy delete-participant
supabase functions deploy reopen-session
supabase functions deploy ingest-instrument
```

`start-session` is clinician-only but is deployed with `--no-verify-jwt` because the gateway check
is disabled for it in `config.toml`; it validates the bearer JWT itself via `requireClinician`.
`config.toml` needs, in addition to what Workstream A already set:

```toml
[functions.session-state]
verify_jwt = false
```

| function           | auth                                | verify_jwt |
| ------------------ | ----------------------------------- | ---------- |
| start-session      | clinician JWT (checked in function) | false      |
| session-state      | resume token                        | false      |
| chat-turn          | resume token                        | false      |
| end-session        | resume token, or clinician JWT + id | false      |
| confirm-summary    | resume token                        | false      |
| export-session     | clinician JWT                       | default    |
| delete-participant | clinician JWT                       | default    |
| reopen-session     | clinician JWT                       | default    |
| ingest-instrument  | clinician JWT                       | default    |

## Secrets

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5      # conversational call; this is the default
supabase secrets set SAFETY_MODEL=claude-haiku-4-5-20251001   # safety screen; "off" disables it
supabase secrets set EXTRACT_MODEL=claude-haiku-4-5-20251001  # per-turn extraction (v1.1 §C)
supabase secrets set PROMPT_VERSION=2026-09-18.2           # stamped on every session
supabase secrets set WEB_ORIGIN=https://<user>.github.io   # CORS; default "*" for the POC
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform (`SERVICE_ROLE_KEY` is
accepted as an alias). The price table for cost estimates is in `_shared/config.ts`
(`PRICE_TABLE_USD_PER_MTOK`, placeholder values to verify against the current Anthropic price list).

## Request / response contract

All bodies are JSON. Errors are `{error: {code, message, retryable}}` with a proper status code (400
validation, 401 bad token/JWT, 403 not a clinician, 404, 409 wrong session status, 500 internal).
CORS preflight is handled on every function.

| function             | method / body                                                                                                                                                                                                                             | response                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start-session`      | POST `{participant: {study_id?: string\|null, display_name, preferred_language, age_band, reading_comfort, diagnosis_code, diagnosis_text}, timepoint, respondent, clinician_note?: {note, focus_constructs: string[]}}`                  | 201 `{session_id, participant_id, study_id, resume_token, patient_link_path: "/p/<token>"}`                                                                                                                                                                                                                                                                                                                                                                                     |
| `session-state`      | POST `{resume_token}`; or `{resume_token, action: "consent", consent_variant}`; or `{resume_token, action: "update_intake", fields: {display_name?, preferred_language?, age_band?, reading_comfort?, diagnosis_code?, diagnosis_text?}}` | `{session_id, status, language, participant: {display_name, preferred_language, age_band, reading_comfort, diagnosis_code, diagnosis_text}, respondent, timepoint, consent_variant_needed: "adult"\|"minor-assent"\|"guardian", messages: [{seq, role, content, created_at}], coverage: {covered, total_active}, phase: "triage"\|"explore"\|"wrap-up", current_focus: string\|null, focus_progress: {confirmed, total}, turns_used, max_turns, patient_summary: string\|null}` |
| `chat-turn`          | POST `{session_id, resume_token, text: string\|null, input_mode: "text"\|"voice"\|null}` — `text: null` requests the opening message                                                                                                      | `text/event-stream` (below); pre-stream failures are JSON errors                                                                                                                                                                                                                                                                                                                                                                                                                |
| `end-session`        | POST `{resume_token}` or clinician JWT + `{session_id}`                                                                                                                                                                                   | `{status: "summary-review", patient_summary}` (idempotent)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `confirm-summary`    | POST `{resume_token, corrections: [{construct_id?: string\|null, patient_text}], confirmed: true}`                                                                                                                                        | `{status: "completed"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `export-session`     | GET `?session_id=&format=fhir\|csv`, clinician JWT                                                                                                                                                                                        | file with `Content-Disposition: attachment` (`application/fhir+json` or `text/csv`)                                                                                                                                                                                                                                                                                                                                                                                             |
| `delete-participant` | POST `{participant_id}`, clinician JWT                                                                                                                                                                                                    | `{deleted: true, study_id}`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `reopen-session`     | POST `{session_id}`, clinician JWT                                                                                                                                                                                                        | `{status: "active"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ingest-instrument`  | POST `{instrument_slug, text, population: "adult"\|"pediatric"}` or `{action: "approve", construct_map_id}`, clinician JWT                                                                                                                | 201 the `construct_maps` row (draft, version max+1); approve → `{status: "approved"}`                                                                                                                                                                                                                                                                                                                                                                                           |

`consent_variant_needed`: age band `under-8`/`8-12`/`13-17` with respondent `self`/`both` →
`minor-assent`; respondent `guardian` → `guardian`; otherwise `adult`.

### SSE contract (`chat-turn`, SPEC §7.6 + v1.1 §C)

```
event: token     data: {"t": "..."}                                             (many)
event: evidence  data: {"construct_id", "severity", "confidence"}               (0..n, AFTER the text)
event: status    data: {"coverage": {"covered", "total_active"}, "phase": "triage"|"explore"|"wrap-up",
                        "current_focus": string|null, "focus_progress": {"confirmed", "total"},
                        "turns_used", "max_turns"}
event: safety    data: {"message"}                                              (terminal)
event: ended     data: {"reason": "coverage_complete"|"turn_budget"|"patient_requested"} (terminal)
event: error     data: {"retryable": bool, "message"}                           (terminal)
```

Normal turn: `token*` → `evidence*` → `status`. **v1.1: evidence arrives after the reply text**,
because the conversational call carries no tools and streams immediately; a second, non-streaming
call (`EXTRACT_MODEL`) reads the patient message afterwards and files the evidence. Session end:
`token*` → `status` → `ended`. Safety halt: `safety` only (keyword, before any model call) or
`token*` → `safety` (model screen, which runs concurrently with the stream and is applied after it).
Pause: fixed `token` → `status`. Stop: fixed `token` → `ended{patient_requested}`. After `ended` the
client calls `end-session`. Retrying a failed turn with the same `text` does not duplicate the
patient message.

Per turn the engine makes at most three model calls: the safety screen (`SAFETY_MODEL`, started
together with the stream), the conversational reply (`ANTHROPIC_MODEL`, no tools, no `tool_choice`,
`max_tokens` 400), and the extraction (`EXTRACT_MODEL`, strict JSON). An extraction failure is
logged and the turn still ends with a `status` event.

Status codes on `chat-turn` before streaming: 409 `consent_required` (status `intake`), 409
`safety_halted`, 409 `session_closed` (wrapping-up / summary-review / completed), 400
`opening_already_sent` (`text: null` after the first assistant message).

### Phases, focus and confirmation (v1.1 §B)

`sessions.phase` and `sessions.focus_constructs` are recomputed by the tracker every turn and never
trusted to the model:

- **triage** — the map's `triage` block is asked in order; an item counts as answered once an
  evidence row carries its id in `construct_evidence.triage_item`. Items with `timepoints` only
  apply at those timepoints. Triage ends when all applicable items are answered or after 6 assistant
  turns.
- **explore** — focus is derived once (evidence ≥ mild, constructs named during triage, clinician
  focus always; declines excluded; cap 8) and then stays stable. One focus construct at a time until
  `coverage_rules.focus_facet_threshold` (default 0.7) of its facets carry evidence, then the model
  reflects back and the patient confirms.
- **wrap-up** — set when every focus construct is confirmed or declined and triage is done, or when
  the turn/minute budget is spent. The prompt asks for a goodbye and the handler emits `ended` after
  that reply.

**Confirmation representation.** The schema has no boolean for "the patient agreed with the
reflection", and evidence rows must stay patient quotes, so a confirmation is stored as a
`probe_findings` row with `category = "other"` and `finding = "confirmed: <the reflection>"`
(`confirmationText` / `isConfirmation` in `_shared/tracker.ts` are the only writer and reader).
Those rows are filtered out of the profile narrative and surface as `confirmed: true` per construct
instead.

## Where things live

- `_shared/types.ts` — every cross-boundary shape (rows, map, coverage, tools, SSE, profile,
  request/response bodies, `Db` / `AuthClient` / `AnthropicClientLike` interfaces).
- `_shared/tracker.ts` — §7.1 coverage state, active-construct selection, priority order, and the
  v1.1 §B phase machine (`triageState`, `deriveFocus`, `focusState`, `currentFocus`,
  `isCoverageComplete`, `computeTrackerState`).
- `_shared/prompt.ts` — §7.2 system prompt (no tool text in v1.1), §B phase guidance, §C extraction
  prompt, §8 profile/summary and §E ingestion-merge prompts. Header comment carries the prompt file
  version.
- `_shared/extraction.ts` — validates and stores what the extraction call returns. Model output is
  untrusted: construct ids must be active, facet ids must belong to their construct, and a quote
  must really appear in the patient message or the row is dropped.
- `_shared/safety.ts`, `safety_messages.ts`, `control.ts` — deterministic intercepts (en/es).
- `_shared/anthropic.ts` — `streamTurn` (tool loop kept for other callers; with `tools: []` it sends
  neither `tools` nor `tool_choice`) and `completeJson` (retry once).
- `_shared/profile.ts` — §8 deterministic profile + domain severity rule + narrative merge.
- `_shared/export.ts` — §10 FHIR bundle and CSV.
- `_shared/testing.ts` — `FakeDb`, `FakeAnthropic`, fixture map (tests only).
