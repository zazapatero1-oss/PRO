// reopen-session: clinician flips safety-halted → active and marks flags reviewed (SPEC §7.4).

import type { AuthClient, Db, ReopenSessionRequest } from "../_shared/types.ts";
import { badRequest, conflict, jsonResponse, notFound } from "../_shared/errors.ts";
import { requireClinician } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";

export interface ReopenSessionDeps {
  db: Db;
  auth: AuthClient;
  origin?: string;
  now?: () => Date;
}

export async function handleReopenSession(
  deps: ReopenSessionDeps,
  req: Request,
  raw: unknown,
): Promise<Response> {
  const origin = deps.origin ?? "*";
  const now = deps.now ?? (() => new Date());
  const clinician = await requireClinician(req, deps);
  const body = (raw ?? {}) as ReopenSessionRequest;
  if (typeof body.session_id !== "string" || !body.session_id) {
    throw badRequest("session_id is required");
  }
  const session = await deps.db.getSession(body.session_id);
  if (!session) throw notFound("Session not found");
  if (session.status !== "safety-halted") {
    throw conflict("Only safety-halted sessions can be reopened.", "invalid_status");
  }
  const at = now().toISOString();
  await deps.db.reviewSafetyFlags(session.id, clinician.clinicianId, at);
  await deps.db.updateSession(session.id, { status: "active" });
  await deps.db.insertMessage({
    session_id: session.id,
    seq: (await deps.db.listMessages(session.id)).reduce((m, r) => Math.max(m, r.seq), 0) + 1,
    role: "system-event",
    content: "session reopened by clinician",
    input_mode: null,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
  });
  await writeAudit(deps.db, {
    actor_type: "clinician",
    actor_id: clinician.clinicianId,
    action: "session.reopen",
    target_type: "session",
    target_id: session.id,
  });
  return jsonResponse({ status: "active" }, 200, origin);
}
