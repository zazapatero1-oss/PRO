import { assertEquals } from "@std/assert";
import { handleSessionState } from "./handler.ts";
import { seedSession } from "../_shared/testing.ts";
import type { SessionStateResponse } from "../_shared/types.ts";

async function state(
  s: Awaited<ReturnType<typeof seedSession>>,
): Promise<SessionStateResponse> {
  const res = await handleSessionState({ db: s.db }, { resume_token: s.token });
  return await res.json() as SessionStateResponse;
}

Deno.test("session-state: reports phase, current focus and focus progress (v1.1 §C)", async () => {
  const s = await seedSession({ status: "active", startedAt: new Date().toISOString() });
  const fresh = await state(s);
  assertEquals(fresh.phase, "triage");
  assertEquals(fresh.current_focus, null);
  assertEquals(fresh.focus_progress, { confirmed: 0, total: 0 });
  assertEquals(fresh.coverage, { covered: 0, total_active: 4 });

  await s.db.updateSession(s.session.id, {
    phase: "explore",
    focus_constructs: ["appearance.overall", "appearance.nose"],
  });
  await s.db.insertEvidence({
    session_id: s.session.id,
    construct_id: "appearance.overall",
    message_id: null,
    patient_quote: "q",
    quote_gloss_en: "q",
    severity: "moderate",
    confidence: 0.8,
    interference: [],
    facets: ["mirror"],
    triage_item: "overall",
    note: null,
    superseded_by: null,
  });
  await s.db.insertFinding({
    session_id: s.session.id,
    construct_id: "appearance.overall",
    category: "other",
    finding: "confirmed: the mirror is the hard part",
    message_id: null,
  });

  const exploring = await state(s);
  assertEquals(exploring.phase, "explore");
  assertEquals(exploring.current_focus, "appearance.nose");
  assertEquals(exploring.focus_progress, { confirmed: 1, total: 2 });
});
