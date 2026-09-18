// export-session: FHIR R4 bundle or CSV for a session's profile (SPEC §10). Clinician auth.

import type { AuthClient, Db } from "../_shared/types.ts";
import { badRequest, corsHeaders, notFound } from "../_shared/errors.ts";
import { requireClinician } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/db.ts";
import { buildCsv, buildFhirBundle } from "../_shared/export.ts";

export interface ExportSessionDeps {
  db: Db;
  auth: AuthClient;
  origin?: string;
}

export async function handleExportSession(
  deps: ExportSessionDeps,
  req: Request,
): Promise<Response> {
  const origin = deps.origin ?? "*";
  const clinician = await requireClinician(req, deps);
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  const format = url.searchParams.get("format") ?? "";
  if (!sessionId) throw badRequest("session_id is required");
  if (format !== "fhir" && format !== "csv") throw badRequest("format must be fhir or csv");

  const { db } = deps;
  const session = await db.getSession(sessionId);
  if (!session) throw notFound("Session not found");
  const [participant, profileRow, safetyFlags] = await Promise.all([
    db.getParticipant(session.participant_id),
    db.getProfile(session.id),
    db.listSafetyFlags(session.id),
  ]);
  if (!participant) throw notFound("Participant not found");
  if (!profileRow) throw notFound("No profile for this session yet", "no_profile");

  const input = { participant, session, profile: profileRow.profile, safetyFlags };
  const stem = `${participant.study_id}_${session.timepoint}_inferred-profile`;
  await writeAudit(db, {
    actor_type: "clinician",
    actor_id: clinician.clinicianId,
    action: `session.export.${format}`,
    target_type: "session",
    target_id: session.id,
  });

  if (format === "fhir") {
    return new Response(JSON.stringify(buildFhirBundle(input), null, 2), {
      status: 200,
      headers: {
        "content-type": "application/fhir+json; charset=utf-8",
        "content-disposition": `attachment; filename="${stem}.fhir.json"`,
        ...corsHeaders(origin),
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
    });
  }
  return new Response(buildCsv(input), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${stem}.csv"`,
      ...corsHeaders(origin),
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
