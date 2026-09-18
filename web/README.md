# FACE-Q Conversation — web app

Vite + React 18 + TypeScript SPA for the patient conversation and the clinician review
(SPEC §9). No UI framework; hand-written CSS with variables, phone-first, print stylesheet
for the PDF export. All UI strings live in `src/i18n/{en,es}.json`.

## Run

```sh
npm install
cp .env.example .env        # fill in Supabase values, or leave VITE_MOCK=1
npm run dev:mock            # whole app against in-memory fixtures, no backend
npm run dev                 # against the Supabase project in .env
```

Mock mode (`VITE_MOCK=1`) serves the edge-function contracts from `src/api/mock/`:
three demo participants mirroring SPEC §13, a scripted en/es conversation streamed as real
SSE bytes with token pacing, deterministic skip / break / stop handling, a keyword safety
intercept, profile + summary generation, FHIR/CSV exports and the ingest stub. State is
persisted in `localStorage` so reload-to-resume works; "Reset demo data" on the
participants page clears it.

Mock shortcuts:

- `/p/demo-es` — a seeded Spanish post-op intake session (SPEC §14 step 2).
- Clinician sign-in page has a "Sign in as demo clinician" button.
- Typing `!fail` in the chat simulates one retryable error to show the "one moment…" retry.
- Phrases like "kill myself" / "matarme" trigger the safety intercept.

## Scripts

| script | what |
|---|---|
| `npm run build` | `tsc -b` + Vite build to `dist/` (also emits `404.html` for GitHub Pages) |
| `npm run test` | Vitest (jsdom + Testing Library) |
| `npm run lint` | ESLint (typescript-eslint, react-hooks, react-refresh) |
| `npm run preview` | serve `dist/` |

## Environment

| var | meaning |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | public anon key (never the service role) |
| `VITE_FUNCTIONS_URL` | edge functions base, usually `${VITE_SUPABASE_URL}/functions/v1` |
| `VITE_BASE_PATH` | base path for GitHub Pages project sites, e.g. `/face-q-conversation/` (default `/`) |
| `VITE_MOCK` | `1` to use the in-memory mock backend |

The Anthropic key is never present in this package; only edge functions call Anthropic.

## Deploy to GitHub Pages

```sh
VITE_BASE_PATH=/face-q-conversation/ VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… VITE_FUNCTIONS_URL=… npm run build
# publish dist/ to the gh-pages branch (the CI workflow in .github/ does this)
```

Deep links (`/p/<token>`, `/clinician/session/<id>`) survive a hard reload on Pages because
the build emits a `404.html` that encodes the path into `?/…` and `index.html` restores it
before the router boots. The number of base-path segments is baked in from `VITE_BASE_PATH`.

For magic-link sign-in, add `https://<user>.github.io/<repo>/clinician` to the Supabase
Auth redirect allow-list.

## Layout

```
src/
  api/            single backend boundary
    types.ts      the Api interface every screen codes against
    real.ts       fetch + supabase-js implementation of the SPEC contracts
    sse.ts        POST-based SSE parser (fetch + ReadableStream)
    mock/         in-memory implementation, fixtures, scripted conversation, fake SSE
  i18n/           en.json, es.json, translate.ts, useT() provider (sets <html lang dir>)
  lib/            speech (SpeechInput interface + Web Speech impl), qr, severity, download
  patient/        /p/:token flow: language → consent → face page → chat → summary → thanks
  clinician/      sign-in, participants, participant timeline + new session, session review, instruments
  components/     landing, shared UI (dialog, tooltip, badges)
  types.ts        client mirror of SPEC §5–§8 shapes and function contracts
```

Swapping the mock for the real backend is one line in `src/api/index.ts`.

## Voice input

`src/lib/speech.ts` defines `SpeechInput { start, stop, onResult, onError, onEnd }`; the
default implementation wraps `SpeechRecognition` / `webkitSpeechRecognition` (Safari on iOS
supports the prefixed form). Unsupported browsers get a plain-language fallback note. The
transcript lands in the text box for editing and is sent with `input_mode: "voice"`.
