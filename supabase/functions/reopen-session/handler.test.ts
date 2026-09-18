import { assert, assertEquals } from "@std/assert";
import { handleReopenSession } from "./handler.ts";
import { handleDeleteParticipant } from "../delete-participant/handler.ts";
import { fakeAuth, seedSession } from "../_shared/testing.ts";

const auth = fakeAuth({ jwt: "clin-1" });
const req = () =>
  new Request("http://x", { method: "POST", headers: { authorization: "Bearer jwt" } });

Deno.test("reopen-session: safety-halted → active, flags reviewed, audit", async () => {
  const s = await seedSession({ status: "safety-halted" });
  s.db.clinicians.push({ id: "clin-1", display_name: "Dr", created_at: "" });
  await s.db.insertSafetyFlag({
    session_id: s.session.id,
    message_id: null,
    trigger: "self_harm",
    detected_by: "keyword",
    action_taken: "halt",
    reviewed_by: null,
    reviewed_at: null,
  });
  const res = await handleReopenSession({ db: s.db, auth }, req(), { session_id: s.session.id });
  assertEquals(await res.json(), { status: "active" });
  assertEquals(s.db.sessions[0].status, "active");
  assertEquals(s.db.flags[0].reviewed_by, "clin-1");
  assert(s.db.flags[0].reviewed_at);
  assertEquals(s.db.messages[0].role, "system-event");
  assert(s.db.audit.some((a) => a.action === "session.reopen" && a.actor_id === "clin-1"));
  const again = await handleReopenSession({ db: s.db, auth }, req(), { session_id: s.session.id })
    .catch((e) => e);
  assertEquals(again.status, 409);
});

Deno.test("delete-participant: cascades and leaves one audit row with study_id only", async () => {
  const s = await seedSession({ status: "active" });
  s.db.clinicians.push({ id: "clin-1", display_name: "Dr", created_at: "" });
  await s.db.insertMessage({
    session_id: s.session.id,
    seq: 1,
    role: "patient",
    content: "hi",
    input_mode: "text",
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  const res = await handleDeleteParticipant({ db: s.db, auth }, req(), {
    participant_id: s.participant.id,
  });
  assertEquals(await res.json(), { deleted: true, study_id: "P-0001" });
  assertEquals(s.db.participants.length, 0);
  assertEquals(s.db.sessions.length, 0);
  assertEquals(s.db.messages.length, 0);
  const audit = s.db.audit.filter((a) => a.action === "participant.delete");
  assertEquals(audit.length, 1);
  assertEquals(audit[0].target_id, "P-0001");
  assertEquals(audit[0].metadata, { study_id: "P-0001" });
  assertEquals(JSON.stringify(audit[0]).includes(s.participant.id), false);
});
