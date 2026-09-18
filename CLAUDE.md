# Working conventions

Read `SPEC.md` first. It is the single source of truth for scope, data model, API
contracts and principles. Do not expand scope.

## Hard rules
- Never store, paste, or generate verbatim item text from FACE-Q or any licensed
  instrument. Construct descriptions are paraphrased abstractions of what a scale
  measures.
- Never call the UI output a "FACE-Q score". Use "inferred profile" / "AI-assisted".
- The Anthropic API key exists only as a Supabase function secret. Never in `web/`.
- No PHI: no real names, DOB, addresses, contact details anywhere, including demo
  data and eval personas.
- Safety and control-phrase handling are deterministic code paths, not prompts.

## Code style
- TypeScript strict everywhere. Deno for `supabase/functions`, Node 20 for `web/`.
- Small modules, explicit types for every cross-boundary shape (put shared types in
  `supabase/functions/_shared/types.ts` and mirror the client-facing ones in
  `web/src/types.ts`; keep them in sync with SPEC §5–§8).
- Comments explain *why*, not what. Keep them sparse.
- Tests next to the code they cover (`*.test.ts`, `test_*.py`).
- Anthropic SDK: `npm:@anthropic-ai/sdk` in Deno; model id from env
  `ANTHROPIC_MODEL` (default `claude-sonnet-5`). Use streaming for chat-turn.

## Layout
See SPEC §4. Workers own only their directory; do not edit another workstream's
files. If you need something from another workstream, code against the SPEC
contract and note the assumption in your report.

## Reporting
Final report: what was built, how to run it, tests run and their output, any
deviations from SPEC (with reason), and open questions. Be concrete.
