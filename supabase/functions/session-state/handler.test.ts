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

Deno.test("session-state: submit_screen stores scores, writes evidence, derives focus, skips triage", async () => {
  const s = await seedSession({ status: "consented" });
  s.db.screenItems = [
    {
      id: "adult:face_nose",
      population: "adult",
      construct_id: "appearance.nose",
      domain: "facial",
      text_en: "Nose?",
      text_es: "¿Nariz?",
      low_en: "Bad",
      high_en: "Good",
      low_es: "Mal",
      high_es: "Bien",
      sort_order: 1,
      active: true,
    },
    {
      id: "adult:face_overall",
      population: "adult",
      construct_id: "appearance.overall",
      domain: "facial",
      text_en: "Face?",
      text_es: "¿Cara?",
      low_en: "Bad",
      high_en: "Good",
      low_es: "Mal",
      high_es: "Bien",
      sort_order: 2,
      active: true,
    },
    {
      id: "adult:soc_mood",
      population: "adult",
      construct_id: "psych.mood",
      domain: "social",
      text_en: "Mood?",
      text_es: "¿Ánimo?",
      low_en: "Bad",
      high_en: "Good",
      low_es: "Mal",
      high_es: "Bien",
      sort_order: 3,
      active: true,
    },
  ];
  const before = await handleSessionState({ db: s.db }, { resume_token: s.token });
  const b = await before.json();
  assertEquals(b.screen.done, false);
  assertEquals(b.screen.items.length, 3);

  const res = await handleSessionState({ db: s.db }, {
    resume_token: s.token,
    action: "submit_screen",
    scores: { "adult:face_nose": 2, "adult:face_overall": 5, "adult:soc_mood": 9 },
  });
  assertEquals(res.status, 200);
  const j = await res.json();
  assertEquals(j.screen.done, true);
  assertEquals(j.phase, "explore");
  assertEquals(j.current_focus, "appearance.nose");
  assertEquals(s.db.sessions[0].focus_constructs.slice(0, 2), [
    "appearance.nose",
    "appearance.overall",
  ]);
  assertEquals(s.db.evidence.length, 3);
  assertEquals(s.db.evidence[0].triage_item, "screen:adult:face_nose");

  let code = "";
  try {
    await handleSessionState({ db: s.db }, {
      resume_token: s.token,
      action: "submit_screen",
      scores: { "adult:face_nose": 2, "adult:face_overall": 5, "adult:soc_mood": 9 },
    });
  } catch (err) {
    code = (err as { code?: string }).code ?? "";
  }
  assertEquals(code, "already_submitted");
});
