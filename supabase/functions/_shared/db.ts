// Thin typed repository over the service-role supabase-js client, plus token helpers.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encodeBase64Url, encodeHex } from "@std/encoding";
import type {
  ActorType,
  AuditInsert,
  ClinicianNoteInsert,
  ClinicianNoteRow,
  ClinicianRow,
  ConstructEvidenceInsert,
  ConstructEvidenceRow,
  ConstructMapInsert,
  ConstructMapRow,
  Db,
  DiagnosisCatalogRow,
  InstrumentRow,
  MessageInsert,
  MessageRow,
  ParticipantInsert,
  ParticipantRow,
  ProbeFindingInsert,
  ProbeFindingRow,
  SafetyFlagInsert,
  SafetyFlagRow,
  ScreenItemRow,
  SessionInsert,
  SessionProfileInsert,
  SessionProfileRow,
  SessionRow,
} from "./types.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

export function createServiceClient(url: string, serviceRoleKey: string): AnyClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** 32 random bytes, base64url (SPEC §4). The token itself is never stored. */
export function generateResumeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return encodeHex(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function writeAudit(
  db: Db,
  entry: {
    actor_type: ActorType;
    actor_id: string;
    action: string;
    target_type: string;
    target_id: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const row: AuditInsert = { ...entry, metadata: entry.metadata ?? {} };
  return db.insertAudit(row);
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

interface PgResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

function unwrap<T>(res: PgResult<T>, what: string): T {
  if (res.error) throw new Error(`db ${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`db ${what}: no data`);
  return res.data;
}

function unwrapNullable<T>(res: PgResult<T>, what: string): T | null {
  if (res.error) throw new Error(`db ${what}: ${res.error.message}`);
  return res.data ?? null;
}

export function createDb(client: AnyClient): Db {
  const t = (name: string) => client.from(name);

  const one = async <T>(name: string, col: string, val: string): Promise<T | null> => {
    const r: PgResult<T> = await t(name).select("*").eq(col, val).maybeSingle();
    return unwrapNullable(r, `select ${name}`);
  };

  const insert = async <T>(name: string, row: object): Promise<T> => {
    const r: PgResult<T> = await t(name).insert(row).select("*").single();
    return unwrap(r, `insert ${name}`);
  };

  const update = async <T>(name: string, col: string, val: string, patch: object): Promise<T> => {
    const r: PgResult<T> = await t(name).update(patch).eq(col, val).select("*").single();
    return unwrap(r, `update ${name}`);
  };

  const list = async <T>(name: string, col: string, val: string, order: string): Promise<T[]> => {
    const r: PgResult<T[]> = await t(name).select("*").eq(col, val).order(order, {
      ascending: true,
    });
    return unwrapNullable(r, `list ${name}`) ?? [];
  };

  return {
    getClinician: (id) => one<ClinicianRow>("clinicians", "id", id),
    getDiagnosis: (code) => one<DiagnosisCatalogRow>("diagnosis_catalog", "code", code),
    listScreenItems: async (population) => {
      const r: PgResult<ScreenItemRow[]> = await t("screen_items").select("*")
        .eq("population", population).eq("active", true).order("sort_order", { ascending: true });
      return unwrapNullable(r, "list screen_items") ?? [];
    },

    getParticipant: (id) => one<ParticipantRow>("participants", "id", id),
    getParticipantByStudyId: (studyId) => one<ParticipantRow>("participants", "study_id", studyId),
    insertParticipant: (row: ParticipantInsert) => insert<ParticipantRow>("participants", row),
    nextStudyId: async () => {
      const r: PgResult<string> = await client.rpc("next_study_id");
      const id = unwrap(r, "rpc next_study_id");
      if (typeof id !== "string" || !id) throw new Error("db rpc next_study_id: empty result");
      return id;
    },
    updateParticipant: (id, patch) => update<ParticipantRow>("participants", "id", id, patch),
    deleteParticipant: async (id) => {
      const res: PgResult<unknown> = await t("participants").delete().eq("id", id);
      if (res.error) throw new Error(`db delete participants: ${res.error.message}`);
    },

    getInstrumentBySlug: (slug) => one<InstrumentRow>("instruments", "slug", slug),
    getConstructMap: (id) => one<ConstructMapRow>("construct_maps", "id", id),
    getLatestApprovedMap: async (slug) => {
      const r: PgResult<ConstructMapRow> = await t("construct_maps")
        .select("*")
        .eq("slug", slug)
        .eq("status", "approved")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return unwrapNullable(r, "select construct_maps");
    },
    getLatestApprovedMapForPopulation: async (population) => {
      const r: PgResult<ConstructMapRow> = await t("construct_maps")
        .select("*")
        .eq("population", population)
        .eq("status", "approved")
        .order("approved_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return unwrapNullable(r, "select construct_maps");
    },
    getMaxMapVersion: async (slug) => {
      const r: PgResult<{ version: number }> = await t("construct_maps")
        .select("version")
        .eq("slug", slug)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return unwrapNullable(r, "select construct_maps")?.version ?? 0;
    },
    insertConstructMap: (row: ConstructMapInsert) => insert<ConstructMapRow>("construct_maps", row),
    updateConstructMap: (id, patch) => update<ConstructMapRow>("construct_maps", "id", id, patch),

    getSession: (id) => one<SessionRow>("sessions", "id", id),
    getSessionByTokenHash: (hash) => one<SessionRow>("sessions", "resume_token_hash", hash),
    insertSession: (row: SessionInsert) => insert<SessionRow>("sessions", row),
    updateSession: (id, patch) => update<SessionRow>("sessions", "id", id, patch),
    listSessionsForParticipant: (participantId) =>
      list<SessionRow>("sessions", "participant_id", participantId, "created_at"),

    listClinicianNotes: (sessionId) =>
      list<ClinicianNoteRow>("clinician_notes", "session_id", sessionId, "created_at"),
    insertClinicianNote: (row: ClinicianNoteInsert) =>
      insert<ClinicianNoteRow>("clinician_notes", row),

    listMessages: (sessionId) => list<MessageRow>("messages", "session_id", sessionId, "seq"),
    insertMessage: (row: MessageInsert) => insert<MessageRow>("messages", row),

    listEvidence: (sessionId) =>
      list<ConstructEvidenceRow>("construct_evidence", "session_id", sessionId, "created_at"),
    insertEvidence: (row: ConstructEvidenceInsert) =>
      insert<ConstructEvidenceRow>("construct_evidence", row),
    updateEvidence: async (id, patch) => {
      const res: PgResult<unknown> = await t("construct_evidence").update(patch).eq("id", id);
      if (res.error) throw new Error(`db update construct_evidence: ${res.error.message}`);
    },

    listFindings: (sessionId) =>
      list<ProbeFindingRow>("probe_findings", "session_id", sessionId, "created_at"),
    insertFinding: (row: ProbeFindingInsert) => insert<ProbeFindingRow>("probe_findings", row),

    getProfile: (sessionId) => one<SessionProfileRow>("session_profiles", "session_id", sessionId),
    upsertProfile: async (row: SessionProfileInsert) => {
      const r: PgResult<SessionProfileRow> = await t("session_profiles")
        .upsert(row, { onConflict: "session_id" })
        .select("*")
        .single();
      return unwrap(r, "upsert session_profiles");
    },

    listSafetyFlags: (sessionId) =>
      list<SafetyFlagRow>("safety_flags", "session_id", sessionId, "created_at"),
    insertSafetyFlag: (row: SafetyFlagInsert) => insert<SafetyFlagRow>("safety_flags", row),
    reviewSafetyFlags: async (sessionId, clinicianId, at) => {
      const res: PgResult<unknown> = await t("safety_flags")
        .update({ reviewed_by: clinicianId, reviewed_at: at })
        .eq("session_id", sessionId)
        .is("reviewed_at", null);
      if (res.error) throw new Error(`db update safety_flags: ${res.error.message}`);
    },

    insertAudit: async (row: AuditInsert) => {
      const res: PgResult<unknown> = await t("audit_log").insert(row);
      if (res.error) throw new Error(`db insert audit_log: ${res.error.message}`);
    },
  };
}
