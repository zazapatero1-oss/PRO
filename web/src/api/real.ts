import { config } from '../config'
import { DIAGNOSIS_CATALOG } from '../data/diagnosisCatalog'
import type {
  ApiErrorBody,
  ClinicianNoteRow,
  ConstructEvidenceRow,
  ConstructMapRow,
  DiagnosisCatalogEntry,
  InstrumentRow,
  MessageRow,
  Participant,
  ProbeFindingRow,
  SafetyFlagRow,
  SessionDetail,
  SessionProfileRow,
  SessionRow,
  SessionState,
  Timepoint,
} from '../types'
import { TIMEPOINTS } from '../types'
import { ApiError } from './errors'
import { supabase } from './supabase'
import type { Api, AuthUser } from './types'

async function authHeaders(): Promise<Record<string, string>> {
  // Patients have no auth session; the anon key satisfies the gateway and the function
  // validates the resume token itself. Avoid loading supabase-js until a session exists.
  let token = config.supabaseAnonKey
  if (hasStoredSession()) {
    const { data } = await (await supabase()).auth.getSession()
    token = data.session?.access_token ?? token
  }
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function readError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null
  try {
    body = (await res.json()) as ApiErrorBody
  } catch {
    /* non-JSON error body */
  }
  const e = body?.error
  return new ApiError(e?.message ?? `Request failed (${res.status})`, {
    code: e?.code ?? `http_${res.status}`,
    retryable: e?.retryable ?? (res.status >= 500 || res.status === 429),
    status: res.status,
  })
}

async function callFn<T>(name: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${config.functionsUrl}/${name}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  } catch {
    return false
  }
}

function toUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null): AuthUser | null {
  if (!u) return null
  const name = u.user_metadata?.display_name
  return { id: u.id, email: u.email ?? null, display_name: typeof name === 'string' ? name : null }
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new ApiError(res.error.message, { code: 'db' })
  if (res.data === null) throw new ApiError('Not found', { code: 'not_found', status: 404 })
  return res.data
}

export function createRealApi(): Api {
  const db = () => supabase()
  // `from` is a plain method on the client, so binding once per call is cheap.
  const q = async () => {
    const c = await db()
    return c.from.bind(c)
  }

  const api: Api = {
    // ---- patient ----
    sessionState: (resume_token) => callFn<SessionState>('session-state', { resume_token }),
    consent: (resume_token, consent_variant) =>
      callFn<SessionState>('session-state', { resume_token, action: 'consent', consent_variant }),
    updateIntake: (resume_token, fields) =>
      callFn<SessionState>('session-state', { resume_token, action: 'update_intake', fields }),

    async chatTurn(session_id, resume_token, text, input_mode, signal) {
      const res = await fetch(`${config.functionsUrl}/chat-turn`, {
        method: 'POST',
        headers: { ...(await authHeaders()), Accept: 'text/event-stream' },
        body: JSON.stringify({ session_id, resume_token, text, input_mode }),
        signal,
      })
      if (!res.ok) throw await readError(res)
      if (!res.body) throw new ApiError('Empty stream', { code: 'empty_stream', retryable: true })
      return res.body
    },

    endSession: (resume_token) => callFn('end-session', { resume_token }),
    confirmSummary: (resume_token, corrections) =>
      callFn('confirm-summary', { resume_token, corrections, confirmed: true }),

    async diagnosisCatalog() {
      // Only clinicians can read the table (RLS); patients get the static mirror.
      const { data, error } = await (await q())('diagnosis_catalog').select('*').order('label_en')
      if (error || !data || data.length === 0) return DIAGNOSIS_CATALOG
      return data as DiagnosisCatalogEntry[]
    },

    // ---- auth ----
    async getUser() {
      const { data } = await (await db()).auth.getUser()
      return toUser(data.user)
    },
    onAuthChange(cb) {
      let unsub: (() => void) | null = null
      let cancelled = false
      void db().then((c) => {
        if (cancelled) return
        const { data } = c.auth.onAuthStateChange((_evt, session) => cb(toUser(session?.user ?? null)))
        unsub = () => data.subscription.unsubscribe()
      })
      return () => {
        cancelled = true
        unsub?.()
      }
    },
    async signInWithMagicLink(email) {
      const redirect = new URL(`${config.basePath}clinician`, window.location.origin).toString()
      const { error } = await (await db()).auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } })
      if (error) throw new ApiError(error.message, { code: 'auth' })
    },
    async signInAsDemo() {
      throw new ApiError('Demo sign-in is only available in mock mode', { code: 'not_mock' })
    },
    async signOut() {
      await (await db()).auth.signOut()
    },

    // ---- clinician reads ----
    async listParticipants() {
      const participants = must(
        await (await q())('participants').select('*').is('deleted_at', null).order('study_id'),
      ) as Participant[]
      const sessions = must(
        await (await q())('sessions')
          .select('id, participant_id, timepoint, status, created_at')
          .order('created_at', { ascending: false }),
      ) as Pick<SessionRow, 'id' | 'participant_id' | 'timepoint' | 'status' | 'created_at'>[]
      const flags = must(await (await q())('safety_flags').select('session_id')) as { session_id: string }[]
      const flagBySession = new Map<string, number>()
      for (const f of flags) flagBySession.set(f.session_id, (flagBySession.get(f.session_id) ?? 0) + 1)

      return participants.map((p) => {
        const mine = sessions.filter((s) => s.participant_id === p.id)
        const completed = mine.filter((s) => s.status === 'completed').map((s) => s.timepoint)
        return {
          participant: p,
          timepoints_completed: TIMEPOINTS.filter((t) => completed.includes(t)),
          last_session_status: mine[0]?.status ?? null,
          last_session_at: mine[0]?.created_at ?? null,
          flag_count: mine.reduce((n, s) => n + (flagBySession.get(s.id) ?? 0), 0),
        }
      })
    },

    async participantTimeline(participantId) {
      const participant = must(
        await (await q())('participants').select('*').eq('id', participantId).single(),
      ) as Participant
      // v_participant_timeline is the intended source; the view's column shape is owned by
      // workstream A, so read the base tables to stay contract-safe and order by timepoint.
      const sessions = must(
        await (await q())('sessions').select('*').eq('participant_id', participantId),
      ) as SessionRow[]
      const ids = sessions.map((s) => s.id)
      const profiles = ids.length
        ? (must(await (await q())('session_profiles').select('*').in('session_id', ids)) as SessionProfileRow[])
        : []
      const flags = ids.length
        ? (must(await (await q())('safety_flags').select('session_id').in('session_id', ids)) as { session_id: string }[])
        : []
      const order = (t: Timepoint) => TIMEPOINTS.indexOf(t)
      sessions.sort((a, b) => order(a.timepoint) - order(b.timepoint) || a.created_at.localeCompare(b.created_at))
      return {
        participant,
        sessions: sessions.map((session) => ({
          session,
          profile: profiles.find((p) => p.session_id === session.id) ?? null,
          flag_count: flags.filter((f) => f.session_id === session.id).length,
        })),
      }
    },

    async sessionDetail(sessionId): Promise<SessionDetail> {
      const session = must(await (await q())('sessions').select('*').eq('id', sessionId).single()) as SessionRow
      const [participant, messages, evidence, findings, profile, safety_flags, clinician_notes, construct_map] =
        await Promise.all([
          (await q())('participants').select('*').eq('id', session.participant_id).single(),
          (await q())('messages').select('*').eq('session_id', sessionId).order('seq'),
          (await q())('construct_evidence').select('*').eq('session_id', sessionId).order('created_at'),
          (await q())('probe_findings').select('*').eq('session_id', sessionId).order('created_at'),
          (await q())('session_profiles').select('*').eq('session_id', sessionId).maybeSingle(),
          (await q())('safety_flags').select('*').eq('session_id', sessionId).order('created_at'),
          (await q())('clinician_notes').select('*').eq('session_id', sessionId).order('created_at'),
          (await q())('construct_maps').select('*').eq('id', session.construct_map_id).maybeSingle(),
        ])
      // Prior session = most recent completed session of the same participant at an earlier timepoint.
      const priorRows = must(
        await (await q())('sessions')
          .select('*')
          .eq('participant_id', session.participant_id)
          .neq('id', sessionId)
          .eq('status', 'completed'),
      ) as SessionRow[]
      const idx = TIMEPOINTS.indexOf(session.timepoint)
      const prior = priorRows
        .filter((s) => TIMEPOINTS.indexOf(s.timepoint) < idx)
        .sort((a, b) => TIMEPOINTS.indexOf(b.timepoint) - TIMEPOINTS.indexOf(a.timepoint))[0]
      let prior_session: SessionDetail['prior_session'] = null
      if (prior) {
        const pp = await (await q())('session_profiles').select('*').eq('session_id', prior.id).maybeSingle()
        prior_session = { session: prior, profile: (pp.data as SessionProfileRow | null) ?? null }
      }
      return {
        session,
        participant: must(participant) as Participant,
        messages: must(messages) as MessageRow[],
        evidence: must(evidence) as ConstructEvidenceRow[],
        findings: must(findings) as ProbeFindingRow[],
        profile: (profile.data as SessionProfileRow | null) ?? null,
        safety_flags: must(safety_flags) as SafetyFlagRow[],
        clinician_notes: must(clinician_notes) as ClinicianNoteRow[],
        construct_map: (construct_map.data as ConstructMapRow | null) ?? null,
        prior_session,
      }
    },

    async listConstructMaps() {
      return must(await (await q())('construct_maps').select('*').order('slug').order('version')) as ConstructMapRow[]
    },
    async listInstruments() {
      return must(await (await q())('instruments').select('*').order('name')) as InstrumentRow[]
    },

    // ---- clinician writes (edge functions) ----
    startSession: (input) => callFn('start-session', input),
    async exportSession(sessionId, format) {
      const url = `${config.functionsUrl}/export-session?session_id=${encodeURIComponent(sessionId)}&format=${format}`
      const res = await fetch(url, { headers: await authHeaders() })
      if (!res.ok) throw await readError(res)
      return res.blob()
    },
    async deleteParticipant(participant_id) {
      await callFn('delete-participant', { participant_id })
    },
    async reopenSession(session_id) {
      await callFn('reopen-session', { session_id })
    },
    ingestInstrument: (input) => callFn('ingest-instrument', input),
    approveConstructMap: (construct_map_id) =>
      callFn('ingest-instrument', { action: 'approve', construct_map_id }),
  }
  return api
}
