// delete-participant: hard delete (DB cascade) + one audit row carrying the study_id only.

import type { AuthClient, Db, DeleteParticipantRequest } from "../_shared/types.ts";
import { badRequest, jsonResponse, notFound } from "../_shared/errors.ts";
import { requireClinician } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";

export interface DeleteParticipantDeps {
  db: Db;
  auth: AuthClient;
  origin?: string;
}

export async function handleDeleteParticipant(
  deps: DeleteParticipantDeps,
  req: Request,
  raw: unknown,
): Promise<Response> {
  const origin = deps.origin ?? "*";
  const clinician = await requireClinician(req, deps);
  const body = (raw ?? {}) as DeleteParticipantRequest;
  if (typeof body.participant_id !== "string" || !body.participant_id) {
    throw badRequest("participant_id is required");
  }
  const participant = await deps.db.getParticipant(body.participant_id);
  if (!participant) throw notFound("Participant not found");
  const studyId = participant.study_id;
  await deps.db.deleteParticipant(participant.id);
  await writeAudit(deps.db, {
    actor_type: "clinician",
    actor_id: clinician.clinicianId,
    action: "participant.delete",
    target_type: "participant",
    target_id: studyId,
    metadata: { study_id: studyId },
  });
  return jsonResponse({ deleted: true, study_id: studyId }, 200, origin);
}
