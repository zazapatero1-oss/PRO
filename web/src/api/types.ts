import type {
  ConsentVariant,
  ConstructMapRow,
  DiagnosisCatalogEntry,
  IngestResult,
  InputMode,
  InstrumentRow,
  IntakeFields,
  ParticipantListItem,
  ParticipantTimeline,
  PatientCorrection,
  SessionDetail,
  SessionState,
  StartSessionInput,
  StartSessionResult,
} from '../types'

export interface AuthUser {
  id: string
  email: string | null
  display_name: string | null
}

/**
 * Single boundary between the UI and the backend. `real.ts` implements it with fetch +
 * supabase-js against the edge functions; `mock/` implements it from in-memory fixtures.
 */
export interface Api {
  // ---- patient side (resume-token auth) ----
  sessionState(resumeToken: string): Promise<SessionState>
  consent(resumeToken: string, variant: ConsentVariant): Promise<SessionState>
  updateIntake(resumeToken: string, fields: IntakeFields): Promise<SessionState>
  /** Returns the raw SSE byte stream; callers decode it with `chatEvents`. */
  chatTurn(
    sessionId: string,
    resumeToken: string,
    text: string | null,
    inputMode: InputMode | null,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>
  endSession(resumeToken: string): Promise<{ status: 'summary-review'; patient_summary: string }>
  confirmSummary(resumeToken: string, corrections: PatientCorrection[]): Promise<{ status: 'completed' }>
  diagnosisCatalog(): Promise<DiagnosisCatalogEntry[]>

  // ---- clinician auth ----
  getUser(): Promise<AuthUser | null>
  onAuthChange(cb: (user: AuthUser | null) => void): () => void
  signInWithMagicLink(email: string): Promise<void>
  /** Mock-only convenience; real implementation throws. */
  signInAsDemo(): Promise<AuthUser>
  signOut(): Promise<void>

  // ---- clinician reads/writes ----
  listParticipants(): Promise<ParticipantListItem[]>
  participantTimeline(participantId: string): Promise<ParticipantTimeline>
  sessionDetail(sessionId: string): Promise<SessionDetail>
  listConstructMaps(): Promise<ConstructMapRow[]>
  listInstruments(): Promise<InstrumentRow[]>
  startSession(input: StartSessionInput): Promise<StartSessionResult>
  exportSession(sessionId: string, format: 'fhir' | 'csv'): Promise<Blob>
  deleteParticipant(participantId: string): Promise<void>
  reopenSession(sessionId: string): Promise<void>
  /** Merges into the latest approved map for the population and returns the draft + diff (v1.1 §E). */
  ingestInstrument(input: {
    instrument_slug: string
    text: string
    population: 'adult' | 'pediatric'
  }): Promise<IngestResult>
  approveConstructMap(constructMapId: string): Promise<ConstructMapRow>
}
