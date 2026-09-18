// Clinician JWT gate and patient resume-token gate (SPEC §4 Auth).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthClient, Db, SessionRow } from "./types.ts";
import { badRequest, forbidden, unauthorized } from "./errors.ts";
import { hashToken } from "./db.ts";

export interface ClinicianIdentity {
  clinicianId: string;
  displayName: string;
}

// deno-lint-ignore no-explicit-any
export function createAuthClient(client: SupabaseClient<any, "public", any>): AuthClient {
  return {
    async getUser(jwt) {
      const { data, error } = await client.auth.getUser(jwt);
      if (error || !data?.user) return null;
      return { id: data.user.id };
    },
  };
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** Validates the user JWT and requires a `clinicians` row for that user. */
export async function requireClinician(
  req: Request,
  deps: { auth: AuthClient; db: Db },
): Promise<ClinicianIdentity> {
  const jwt = bearerToken(req);
  if (!jwt) throw unauthorized("Missing bearer token");
  const user = await deps.auth.getUser(jwt);
  if (!user) throw unauthorized("Invalid or expired token");
  const clinician = await deps.db.getClinician(user.id);
  if (!clinician) throw forbidden("Not a registered clinician", "not_clinician");
  return { clinicianId: clinician.id, displayName: clinician.display_name };
}

/** Looks the session up by sha256(resume_token); optionally checks the session id too. */
export async function requireSessionToken(
  db: Db,
  body: { resume_token?: unknown; session_id?: unknown },
): Promise<SessionRow> {
  const token = typeof body.resume_token === "string" ? body.resume_token.trim() : "";
  if (!token) throw badRequest("resume_token is required", "missing_token");
  const session = await db.getSessionByTokenHash(await hashToken(token));
  if (!session) throw unauthorized("Invalid session link", "invalid_token");
  if (typeof body.session_id === "string" && body.session_id && body.session_id !== session.id) {
    throw unauthorized("Token does not match session", "invalid_token");
  }
  return session;
}
