// Test doubles: in-memory Db, scripted Anthropic client, and a small fixture map.
// Imported by *.test.ts files only.

import type Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicClientLike,
  AuditLogRow,
  AuthClient,
  ClinicianNoteRow,
  ClinicianRow,
  ConstructEvidenceRow,
  ConstructMap,
  ConstructMapRow,
  Db,
  DiagnosisCatalogRow,
  InstrumentRow,
  MessageRow,
  MessageStreamLike,
  ParticipantRow,
  Population,
  ProbeFindingRow,
  SafetyFlagRow,
  ScreenItemRow,
  SessionProfileRow,
  SessionRow,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Fixture construct map (paraphrased abstractions only; no instrument item text)
// ---------------------------------------------------------------------------

export function fixtureMap(overrides: Partial<ConstructMap> = {}): ConstructMap {
  return {
    slug: "test-map",
    version: 1,
    population: "adult",
    language: "en",
    coverage_rules: {
      min_confidence_to_count: 0.6,
      drill_down_threshold: "moderate",
      core_constructs_required: true,
      max_constructs_per_session: 18,
      focus_facet_threshold: 0.7,
    },
    triage: [
      {
        id: "overall",
        intent: "How they feel overall about how their face looks right now",
        maps_to: ["appearance.overall"],
      },
      {
        id: "features",
        intent: "Which parts of their face are on their mind most",
        maps_to: ["appearance.nose"],
      },
      {
        id: "impact",
        intent: "How it affects how they feel about themselves",
        maps_to: ["psych.self_consciousness", "psych.mood"],
      },
      {
        id: "recovery",
        intent: "How recovery is going: pain, swelling, numbness, scarring",
        maps_to: ["outcome.decision"],
        timepoints: ["post-op-2w", "post-op-6w", "post-op-6m", "post-op-12m", "follow-up"],
      },
    ],
    domains: [
      {
        id: "appearance",
        label: "Satisfaction with facial appearance",
        weight: 1,
        constructs: [
          {
            id: "appearance.overall",
            label: "Overall satisfaction with how the face looks",
            description: "How the person feels about their face as a whole.",
            severity_signals: {
              none: "content",
              mild: "occasional dissatisfaction",
              moderate: "regular dissatisfaction, some avoidance",
              severe: "persistent distress, avoidance affecting daily life",
            },
            drill_down: ["Which features", "When it is worse"],
            facets: [
              { id: "mirror", label: "How it looks in the mirror" },
              { id: "photos", label: "How it looks in photos" },
              { id: "wanted_change", label: "What they would want different" },
            ],
            age_variants: {
              pediatric: {
                description: "How the child feels about their face at school and with friends.",
                drill_down: ["Teasing", "Avoiding activities"],
              },
            },
            priority: "core",
          },
          {
            id: "appearance.nose",
            label: "Satisfaction with the nose",
            description: "How they feel about the shape and look of their nose.",
            severity_signals: {
              none: "fine",
              mild: "minor bother",
              moderate: "regular bother",
              severe: "distress",
            },
            drill_down: ["Profile vs front"],
            facets: [
              { id: "shape", label: "Shape of the nose" },
              { id: "breathing", label: "Breathing through it" },
            ],
            priority: "standard",
          },
        ],
      },
      {
        id: "psychological",
        label: "Psychological function",
        weight: 1,
        constructs: [
          {
            id: "psych.self_consciousness",
            label: "Self-consciousness about appearance",
            description: "How much they think about or feel watched because of their face.",
            severity_signals: {
              none: "rarely",
              mild: "sometimes",
              moderate: "often",
              severe: "constantly",
            },
            drill_down: ["Situations", "Onset"],
            facets: [
              { id: "situations", label: "Situations where it is worse" },
              { id: "avoidance", label: "Things they avoid because of it" },
            ],
            priority: "core",
          },
          {
            id: "psych.mood",
            label: "Mood related to appearance",
            description: "Low mood linked to how they look.",
            severity_signals: {
              none: "fine",
              mild: "occasional",
              moderate: "frequent",
              severe: "persistent",
            },
            drill_down: [],
            priority: "optional",
          },
        ],
      },
      {
        id: "outcome",
        label: "Satisfaction with outcome",
        weight: 1,
        constructs: [
          {
            id: "outcome.decision",
            label: "Satisfaction with the decision to have treatment",
            description: "Whether they feel the decision was right for them.",
            severity_signals: {
              none: "glad",
              mild: "small doubts",
              moderate: "regrets",
              severe: "strong regret",
            },
            drill_down: [],
            priority: "standard",
            applicable_timepoints: [
              "post-op-2w",
              "post-op-6w",
              "post-op-6m",
              "post-op-12m",
              "follow-up",
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory Db
// ---------------------------------------------------------------------------

let counter = 0;
export function fakeId(prefix = "id"): string {
  counter++;
  return `${prefix}-${counter.toString().padStart(4, "0")}`;
}

function stamp(): string {
  // Monotonic timestamps so created_at ordering is stable in tests.
  counter++;
  return new Date(1_700_000_000_000 + counter * 1000).toISOString();
}

export class FakeDb implements Db {
  clinicians: ClinicianRow[] = [];
  diagnoses: DiagnosisCatalogRow[] = [];
  participants: ParticipantRow[] = [];
  instruments: InstrumentRow[] = [];
  maps: ConstructMapRow[] = [];
  sessions: SessionRow[] = [];
  notes: ClinicianNoteRow[] = [];
  messages: MessageRow[] = [];
  evidence: ConstructEvidenceRow[] = [];
  findings: ProbeFindingRow[] = [];
  profiles: SessionProfileRow[] = [];
  flags: SafetyFlagRow[] = [];
  audit: AuditLogRow[] = [];

  getClinician(id: string) {
    return Promise.resolve(this.clinicians.find((c) => c.id === id) ?? null);
  }
  getDiagnosis(code: string) {
    return Promise.resolve(this.diagnoses.find((d) => d.code === code) ?? null);
  }
  screenItems: ScreenItemRow[] = [];
  listScreenItems(population: Population) {
    return Promise.resolve(
      this.screenItems.filter((i) => i.population === population && i.active)
        .sort((a, b) => a.sort_order - b.sort_order),
    );
  }
  getParticipant(id: string) {
    return Promise.resolve(this.participants.find((p) => p.id === id) ?? null);
  }
  getParticipantByStudyId(studyId: string) {
    return Promise.resolve(this.participants.find((p) => p.study_id === studyId) ?? null);
  }
  insertParticipant(row: Parameters<Db["insertParticipant"]>[0]) {
    const full: ParticipantRow = {
      id: fakeId("part"),
      created_at: stamp(),
      ...row,
    } as ParticipantRow;
    this.participants.push(full);
    return Promise.resolve(full);
  }
  studyIdCounter = 0;
  nextStudyId() {
    this.studyIdCounter++;
    return Promise.resolve(`P-${this.studyIdCounter.toString().padStart(4, "0")}`);
  }
  updateParticipant(id: string, patch: Partial<ParticipantRow>) {
    const p = this.participants.find((x) => x.id === id);
    if (!p) throw new Error("participant not found");
    Object.assign(p, patch);
    return Promise.resolve(p);
  }
  deleteParticipant(id: string) {
    this.participants = this.participants.filter((p) => p.id !== id);
    const sessionIds = new Set(
      this.sessions.filter((s) => s.participant_id === id).map((s) => s.id),
    );
    this.sessions = this.sessions.filter((s) => !sessionIds.has(s.id));
    this.messages = this.messages.filter((m) => !sessionIds.has(m.session_id));
    this.evidence = this.evidence.filter((e) => !sessionIds.has(e.session_id));
    this.findings = this.findings.filter((f) => !sessionIds.has(f.session_id));
    this.profiles = this.profiles.filter((p) => !sessionIds.has(p.session_id));
    this.flags = this.flags.filter((f) => !sessionIds.has(f.session_id));
    this.notes = this.notes.filter((n) => !sessionIds.has(n.session_id));
    return Promise.resolve();
  }
  getInstrumentBySlug(slug: string) {
    return Promise.resolve(this.instruments.find((i) => i.slug === slug) ?? null);
  }
  getConstructMap(id: string) {
    return Promise.resolve(this.maps.find((m) => m.id === id) ?? null);
  }
  getLatestApprovedMap(slug: string) {
    const rows = this.maps.filter((m) => m.slug === slug && m.status === "approved")
      .sort((a, b) => b.version - a.version);
    return Promise.resolve(rows[0] ?? null);
  }
  getLatestApprovedMapForPopulation(population: ConstructMapRow["population"]) {
    const rows = this.maps.filter((m) => m.population === population && m.status === "approved")
      .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""));
    return Promise.resolve(rows[0] ?? null);
  }
  getMaxMapVersion(slug: string) {
    return Promise.resolve(
      this.maps.filter((m) => m.slug === slug).reduce((m, r) => Math.max(m, r.version), 0),
    );
  }
  insertConstructMap(row: Parameters<Db["insertConstructMap"]>[0]) {
    const full: ConstructMapRow = {
      id: fakeId("map"),
      created_at: stamp(),
      ...row,
    } as ConstructMapRow;
    this.maps.push(full);
    return Promise.resolve(full);
  }
  updateConstructMap(id: string, patch: Partial<ConstructMapRow>) {
    const m = this.maps.find((x) => x.id === id);
    if (!m) throw new Error("map not found");
    Object.assign(m, patch);
    return Promise.resolve(m);
  }
  getSession(id: string) {
    return Promise.resolve(this.sessions.find((s) => s.id === id) ?? null);
  }
  getSessionByTokenHash(hash: string) {
    return Promise.resolve(this.sessions.find((s) => s.resume_token_hash === hash) ?? null);
  }
  insertSession(row: Parameters<Db["insertSession"]>[0]) {
    const full: SessionRow = { id: fakeId("sess"), created_at: stamp(), ...row } as SessionRow;
    this.sessions.push(full);
    return Promise.resolve(full);
  }
  updateSession(id: string, patch: Partial<SessionRow>) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s) throw new Error("session not found");
    Object.assign(s, patch);
    return Promise.resolve({ ...s });
  }
  listSessionsForParticipant(participantId: string) {
    return Promise.resolve(this.sessions.filter((s) => s.participant_id === participantId));
  }
  listClinicianNotes(sessionId: string) {
    return Promise.resolve(this.notes.filter((n) => n.session_id === sessionId));
  }
  insertClinicianNote(row: Parameters<Db["insertClinicianNote"]>[0]) {
    const full: ClinicianNoteRow = {
      id: fakeId("note"),
      created_at: stamp(),
      ...row,
    } as ClinicianNoteRow;
    this.notes.push(full);
    return Promise.resolve(full);
  }
  listMessages(sessionId: string) {
    return Promise.resolve(
      this.messages.filter((m) => m.session_id === sessionId).sort((a, b) => a.seq - b.seq).map((
        m,
      ) => ({ ...m })),
    );
  }
  insertMessage(row: Parameters<Db["insertMessage"]>[0]) {
    if (this.messages.some((m) => m.session_id === row.session_id && m.seq === row.seq)) {
      throw new Error(`duplicate seq ${row.seq}`);
    }
    const full: MessageRow = { id: fakeId("msg"), created_at: stamp(), ...row } as MessageRow;
    this.messages.push(full);
    return Promise.resolve(full);
  }
  listEvidence(sessionId: string) {
    return Promise.resolve(
      this.evidence.filter((e) => e.session_id === sessionId).map((e) => ({ ...e })),
    );
  }
  insertEvidence(row: Parameters<Db["insertEvidence"]>[0]) {
    // Mirrors the DB defaults for facets / triage_item.
    const full: ConstructEvidenceRow = {
      id: fakeId("ev"),
      created_at: stamp(),
      ...row,
      facets: row.facets ?? [],
      triage_item: row.triage_item ?? null,
    } as ConstructEvidenceRow;
    this.evidence.push(full);
    return Promise.resolve(full);
  }
  updateEvidence(id: string, patch: Partial<ConstructEvidenceRow>) {
    const e = this.evidence.find((x) => x.id === id);
    if (!e) throw new Error("evidence not found");
    Object.assign(e, patch);
    return Promise.resolve();
  }
  listFindings(sessionId: string) {
    return Promise.resolve(
      this.findings.filter((f) => f.session_id === sessionId).map((f) => ({ ...f })),
    );
  }
  insertFinding(row: Parameters<Db["insertFinding"]>[0]) {
    const full: ProbeFindingRow = {
      id: fakeId("find"),
      created_at: stamp(),
      ...row,
    } as ProbeFindingRow;
    this.findings.push(full);
    return Promise.resolve(full);
  }
  getProfile(sessionId: string) {
    return Promise.resolve(this.profiles.find((p) => p.session_id === sessionId) ?? null);
  }
  upsertProfile(row: Parameters<Db["upsertProfile"]>[0]) {
    const full: SessionProfileRow = { generated_at: stamp(), ...row } as SessionProfileRow;
    const i = this.profiles.findIndex((p) => p.session_id === row.session_id);
    if (i >= 0) this.profiles[i] = full;
    else this.profiles.push(full);
    return Promise.resolve(full);
  }
  listSafetyFlags(sessionId: string) {
    return Promise.resolve(this.flags.filter((f) => f.session_id === sessionId));
  }
  insertSafetyFlag(row: Parameters<Db["insertSafetyFlag"]>[0]) {
    const full: SafetyFlagRow = {
      id: fakeId("flag"),
      created_at: stamp(),
      ...row,
    } as SafetyFlagRow;
    this.flags.push(full);
    return Promise.resolve(full);
  }
  reviewSafetyFlags(sessionId: string, clinicianId: string, at: string) {
    for (const f of this.flags) {
      if (f.session_id === sessionId && !f.reviewed_at) {
        f.reviewed_by = clinicianId;
        f.reviewed_at = at;
      }
    }
    return Promise.resolve();
  }
  insertAudit(row: Parameters<Db["insertAudit"]>[0]) {
    this.audit.push({ id: fakeId("audit"), created_at: stamp(), ...row } as AuditLogRow);
    return Promise.resolve();
  }
}

export function fakeAuth(users: Record<string, string>): AuthClient {
  return { getUser: (jwt) => Promise.resolve(users[jwt] ? { id: users[jwt] } : null) };
}

// ---------------------------------------------------------------------------
// Scripted Anthropic client
// ---------------------------------------------------------------------------

export interface ScriptedReply {
  text?: string;
  toolUses?: { name: string; input: unknown }[];
  stopReason?: Anthropic.StopReason;
  usage?: { input_tokens: number; output_tokens: number };
}

export function makeMessage(reply: ScriptedReply, model = "fake-model"): Anthropic.Message {
  const content: Anthropic.ContentBlock[] = [];
  if (reply.text) content.push({ type: "text", text: reply.text, citations: null });
  for (const tu of reply.toolUses ?? []) {
    content.push({
      type: "tool_use",
      id: fakeId("toolu"),
      name: tu.name,
      input: tu.input,
      caller: { type: "direct" },
    });
  }
  const stop: Anthropic.StopReason = reply.stopReason ??
    ((reply.toolUses?.length ?? 0) > 0 ? "tool_use" : "end_turn");
  return {
    id: fakeId("msg"),
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: reply.usage?.input_tokens ?? 100,
      output_tokens: reply.usage?.output_tokens ?? 20,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
      iterations: null,
      output_tokens_details: null,
    },
  } as unknown as Anthropic.Message;
}

/** The request fields tests inspect; both stream and create params satisfy it. */
export interface FakeParams {
  model: string;
  system?: unknown;
  messages: Anthropic.MessageParam[];
  tools?: unknown;
  max_tokens: number;
}

/**
 * Replies are consumed in order; each `stream`/`create` call takes the next one. A reply may
 * also be a function of the request params (to assert on prompts) or an Error to throw.
 */
export class FakeAnthropic implements AnthropicClientLike {
  calls: { kind: "stream" | "create"; params: FakeParams }[] = [];
  private queue: (ScriptedReply | Error | ((p: FakeParams) => ScriptedReply))[];

  constructor(replies: (ScriptedReply | Error | ((p: FakeParams) => ScriptedReply))[]) {
    this.queue = [...replies];
  }

  private next(params: FakeParams): ScriptedReply {
    const r = this.queue.shift();
    if (!r) throw new Error("FakeAnthropic: no scripted reply left");
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(params) : r;
  }

  messages = {
    stream: (params: Anthropic.MessageStreamParams): MessageStreamLike => {
      this.calls.push({ kind: "stream", params });
      let reply: ScriptedReply | null = null;
      let error: unknown = null;
      try {
        reply = this.next(params);
      } catch (e) {
        error = e;
      }
      const listeners: ((d: string) => void)[] = [];
      return {
        on: (_event: "text", listener: (delta: string) => void) => {
          listeners.push(listener);
          return undefined;
        },
        finalMessage: () => {
          if (error) return Promise.reject(error);
          // Stream text in two chunks to exercise delta handling.
          const text = reply!.text ?? "";
          if (text) {
            const mid = Math.ceil(text.length / 2);
            for (const l of listeners) {
              l(text.slice(0, mid));
              l(text.slice(mid));
            }
          }
          return Promise.resolve(makeMessage(reply!, params.model));
        },
      };
    },
    create: (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
      this.calls.push({ kind: "create", params });
      try {
        return Promise.resolve(makeMessage(this.next(params), params.model));
      } catch (e) {
        return Promise.reject(e);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Session fixture
// ---------------------------------------------------------------------------

export interface SeededSession {
  db: FakeDb;
  session: SessionRow;
  participant: ParticipantRow;
  mapRow: ConstructMapRow;
  token: string;
  tokenHash: string;
}

export async function seedSession(
  opts: Partial<{
    language: "en" | "es";
    ageBand: ParticipantRow["age_band"];
    respondent: SessionRow["respondent"];
    timepoint: SessionRow["timepoint"];
    status: SessionRow["status"];
    phase: SessionRow["phase"];
    focusConstructs: string[];
    map: ConstructMap;
    focus: string[];
    maxTurns: number;
    targetMinutes: number;
    startedAt: string | null;
    expiresAt: string | null;
  }> = {},
): Promise<SeededSession> {
  const { hashToken } = await import("./db.ts");
  const db = new FakeDb();
  const token = "test-token-" + fakeId();
  const tokenHash = await hashToken(token);
  db.diagnoses.push({
    id: fakeId("dx"),
    code: "rhinoplasty",
    label_en: "Nose surgery",
    label_es: "Cirugía de nariz",
    module: "aesthetics",
    default_map_slug_adult: "test-map",
    default_map_slug_pediatric: "test-map-ped",
    focus_constructs: opts.focus ?? [],
    created_at: stamp(),
  });
  const map = opts.map ?? fixtureMap();
  const mapRow = await db.insertConstructMap({
    slug: map.slug,
    version: map.version,
    population: map.population,
    source_instrument_ids: [],
    map,
    status: "approved",
    approved_by: null,
    approved_at: stamp(),
  });
  const participant = await db.insertParticipant({
    study_id: "P-0001",
    display_name: "Sam",
    preferred_language: opts.language ?? "en",
    age_band: opts.ageBand ?? "30-49",
    reading_comfort: "comfortable",
    diagnosis_code: "rhinoplasty",
    diagnosis_text: "",
    is_demo: false,
    deleted_at: null,
  });
  const session = await db.insertSession({
    participant_id: participant.id,
    timepoint: opts.timepoint ?? "baseline",
    respondent: opts.respondent ?? "self",
    language: opts.language ?? "en",
    construct_map_id: mapRow.id,
    prompt_version: "test",
    model_id: "fake-model",
    status: opts.status ?? "consented",
    phase: opts.phase ?? "triage",
    focus_constructs: opts.focusConstructs ?? [],
    resume_token_hash: tokenHash,
    resume_token_expires_at: opts.expiresAt ?? null,
    screen_scores: null,
    screen_completed_at: null,
    max_turns: opts.maxTurns ?? 40,
    target_minutes: opts.targetMinutes ?? 12,
    started_at: opts.startedAt ?? null,
    ended_at: null,
    consent_given_at: stamp(),
    consent_variant: "adult",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd_estimate: null,
  });
  return { db, session, participant, mapRow, token, tokenHash };
}

/** The system prompt as text whether it was sent as a string or as cache-split blocks. */
export function systemText(system: unknown): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system.map((b) => (b as { text?: string }).text ?? "").join("\n\n");
  }
  return String(system);
}
