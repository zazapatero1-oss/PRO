import { DIAGNOSIS_CATALOG } from '../../data/diagnosisCatalog'
import { aggregateDomainSeverity } from '../../lib/severity'
import type {
  ConsentVariant,
  ConstructDef,
  ConstructEvidenceRow,
  ConstructMap,
  ConstructMapRow,
  FacetDef,
  IngestDiff,
  Language,
  MessageRow,
  Participant,
  Profile,
  ProfileDomain,
  SessionProfileRow,
  SessionRow,
  SessionState,
  TriageItem,
} from '../../types'
import { TIMEPOINTS } from '../../types'
import { SCREEN_ITEMS } from './screenItems'
import { ApiError } from '../errors'
import type { Api, AuthUser } from '../types'
import { CONSTRUCT_MAP_ROWS, INSTRUMENT_ROWS, findConstruct } from './constructMaps'
import { buildDemoStore, type ConvoState, type MockStore } from './demoData'
import { SCRIPTS, detectControlPhrase, detectSafety } from './script'
import { fakeSseStream, tokenFrames, type SseFrame } from './sse'
import { buildCsv, buildFhirBundle } from './exporters'

const DOMAIN_LABELS_ES: Record<string, string> = {
  appearance: 'Su aspecto',
  psychological: 'Cómo se siente por dentro',
  social: 'Con otras personas',
  function: 'Respirar, comer y hablar',
  adverse: 'Molestias tras el tratamiento',
  recovery: 'La recuperación',
  outcome: 'El resultado y la decisión',
  age: 'Cómo ve su edad',
}

const STORE_KEY = 'faceq-mock-store-v1'
// Streams run at full speed in tests.
const STREAM_SPEED = import.meta.env.MODE === 'test' ? 0 : 1
const USER_KEY = 'faceq-mock-user'
const DEMO_USER: AuthUser = { id: 'demo-clinician', email: 'demo-clinician@example.test', display_name: 'Demo Clinician' }

function loadStore(): MockStore {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockStore
      parsed.scriptPos ??= {}
      parsed.lastAsks ??= {}
      parsed.convo ??= {}
      return parsed
    }
  } catch {
    /* fall through to a fresh store */
  }
  return buildDemoStore()
}

function saveStore(store: MockStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* storage unavailable (private mode); keep in-memory only */
  }
}

export function resetMockStore() {
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms * STREAM_SPEED))
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
const now = () => new Date().toISOString()

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function isMinor(ageBand: Participant['age_band']) {
  return ageBand === 'under-8' || ageBand === '8-12' || ageBand === '13-17'
}

function mapRowFor(store: MockStore, id: string): ConstructMapRow | null {
  return CONSTRUCT_MAP_ROWS.find((m) => m.id === id) ?? store.draftMaps.find((m) => m.id === id) ?? null
}

function activeConstructIds(map: ConstructMap, diagnosisCode: string, focus: string[]): string[] {
  const all = map.domains.flatMap((d) => d.constructs.map((c) => c.id))
  const dx = DIAGNOSIS_CATALOG.find((d) => d.code === diagnosisCode)
  const wanted = [...new Set([...focus, ...(dx?.focus_constructs ?? [])])].filter((id) => all.includes(id))
  const core = map.domains.flatMap((d) => d.constructs.filter((c) => c.priority === 'core').map((c) => c.id))
  const merged = [...new Set([...wanted, ...core])]
  return merged.slice(0, map.coverage_rules.max_constructs_per_session)
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'with', 'your', 'you', 'my', 'about', 'how', 'in', 'on', 'to', 'for', 'is', 'are', 'feel', 'feelings', 'satisfaction'])

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w))

/** Rewrites a pasted heading into a facet label; never reproduces the source wording verbatim. */
function paraphraseFacet(heading: string): string {
  const key = words(heading).slice(0, 4).join(' ')
  return key ? `What they say about ${key}` : 'An additional detail to explore'
}

/** The construct whose label/description shares the most keywords with the heading, if any. */
function bestMatch(map: ConstructMap, heading: string): ConstructDef | null {
  const hw = new Set(words(heading))
  if (hw.size === 0) return null
  let best: { c: ConstructDef; score: number } | null = null
  for (const d of map.domains)
    for (const c of d.constructs) {
      const cw = words(`${c.label} ${c.id.replace(/[._]/g, ' ')}`)
      const score = cw.filter((w) => hw.has(w)).length
      if (score > 0 && (!best || score > best.score)) best = { c, score }
    }
  return best ? best.c : null
}

function suggestTriage(added: ConstructDef[]): TriageItem[] {
  return added.slice(0, 2).map((c) => ({
    id: `triage.${slugify(c.label).slice(0, 30)}`,
    intent: `Whether ${c.label.toLowerCase()} is something on their mind right now`,
    maps_to: [c.id],
  }))
}

export function createMockApi(): Api {
  let store = loadStore()
  const persist = () => saveStore(store)
  let authListeners: ((u: AuthUser | null) => void)[] = []
  let failOnce = false

  const currentUser = (): AuthUser | null => {
    try {
      const raw = sessionStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as AuthUser) : null
    } catch {
      return null
    }
  }
  const setUser = (u: AuthUser | null) => {
    try {
      if (u) sessionStorage.setItem(USER_KEY, JSON.stringify(u))
      else sessionStorage.removeItem(USER_KEY)
    } catch {
      /* ignore */
    }
    authListeners.forEach((l) => l(u))
  }
  const requireUser = () => {
    if (!currentUser()) throw new ApiError('Not signed in', { code: 'unauthorized', status: 401 })
  }

  const sessionByToken = (token: string): SessionRow => {
    const id = store.tokens[token]
    const s = id ? store.sessions.find((x) => x.id === id) : undefined
    if (!s) throw new ApiError('Invalid or expired link', { code: 'invalid_token', status: 404 })
    return s
  }
  const participantOf = (s: SessionRow): Participant => {
    const p = store.participants.find((p) => p.id === s.participant_id)
    if (!p) throw new ApiError('Participant not found', { code: 'not_found', status: 404 })
    return p
  }
  /** Latest approved map for a population; ingestion merges into this (v1.1 §E). */
  const latestMapFor = (population: 'adult' | 'pediatric'): ConstructMapRow => {
    const rows = [...CONSTRUCT_MAP_ROWS, ...store.draftMaps]
      .filter((m) => m.population === population && m.status === 'approved')
      .sort((a, b) => a.version - b.version)
    const row = rows[rows.length - 1]
    if (!row) throw new ApiError('No approved map for this population', { code: 'not_found', status: 404 })
    return row
  }

  const mapOf = (s: SessionRow): ConstructMap => {
    const row = mapRowFor(store, s.construct_map_id)
    if (!row) throw new ApiError('Construct map missing', { code: 'not_found', status: 500 })
    return row.map
  }
  const focusOf = (s: SessionRow) => store.clinician_notes.filter((n) => n.session_id === s.id).flatMap((n) => n.focus_constructs)

  const coverageOf = (s: SessionRow) => {
    const map = mapOf(s)
    const active = activeConstructIds(map, participantOf(s).diagnosis_code, focusOf(s))
    const covered = new Set(
      store.evidence
        .filter(
          (e) =>
            e.session_id === s.id &&
            !e.superseded_by &&
            (e.severity === 'declined' || (e.confidence >= map.coverage_rules.min_confidence_to_count && e.severity !== 'unclear')),
        )
        .map((e) => e.construct_id)
        .filter((id) => active.includes(id)),
    )
    return { covered: covered.size, total_active: active.length }
  }

  const turnsUsed = (s: SessionRow) => store.messages.filter((m) => m.session_id === s.id && m.role === 'assistant').length

  // Mock tracker state (v1.1 §B). Sessions seeded in the demo store predate it, so finished
  // ones report `wrap-up` and everything else starts in triage.
  const convoOf = (s: SessionRow): ConvoState => {
    const stored = store.convo[s.id]
    if (stored) return stored
    const done = s.status === 'wrapping-up' || s.status === 'summary-review' || s.status === 'completed'
    return { phase: done ? 'wrap-up' : 'triage', current_focus: null, confirmed: [] }
  }
  const focusTotal = (s: SessionRow) => SCRIPTS[s.language].focusPlan.length
  const focusProgressOf = (s: SessionRow) => ({ confirmed: convoOf(s).confirmed.length, total: focusTotal(s) })

  const stateOf = (s: SessionRow): SessionState => {
    const p = participantOf(s)
    const variant: ConsentVariant = s.respondent === 'guardian' ? 'guardian' : isMinor(p.age_band) ? 'minor-assent' : 'adult'
    const profile = store.profiles.find((x) => x.session_id === s.id)
    return {
      session_id: s.id,
      status: s.status,
      language: s.language,
      participant: {
        display_name: p.display_name,
        preferred_language: p.preferred_language,
        age_band: p.age_band,
        reading_comfort: p.reading_comfort,
        diagnosis_code: p.diagnosis_code,
        diagnosis_text: p.diagnosis_text,
      },
      respondent: s.respondent,
      timepoint: s.timepoint,
      consent_variant_needed: variant,
      messages: store.messages
        .filter((m) => m.session_id === s.id)
        .sort((a, b) => a.seq - b.seq)
        .map((m) => ({ seq: m.seq, role: m.role, content: m.content, created_at: m.created_at })),
      coverage: coverageOf(s),
      phase: convoOf(s).phase,
      current_focus: convoOf(s).current_focus,
      focus_progress: focusProgressOf(s),
      turns_used: turnsUsed(s),
      max_turns: s.max_turns,
      patient_summary: profile?.patient_summary ?? null,
      screen: {
        items: SCREEN_ITEMS.filter((i) => i.population === (isMinor(p.age_band) ? 'pediatric' : 'adult')),
        done: !!s.screen_completed_at,
        scores: s.screen_scores ?? null,
      },
    }
  }

  const addMessage = (s: SessionRow, role: MessageRow['role'], content: string, input_mode: MessageRow['input_mode'] = null): MessageRow => {
    const seq = store.messages.filter((m) => m.session_id === s.id).length + 1
    const m: MessageRow = {
      id: uid(),
      session_id: s.id,
      seq,
      role,
      content,
      input_mode,
      tokens_in: role === 'assistant' ? 1200 + seq * 40 : null,
      tokens_out: role === 'assistant' ? Math.round(content.length / 4) : null,
      latency_ms: role === 'assistant' ? 1400 : null,
      created_at: now(),
    }
    store.messages.push(m)
    if (role === 'assistant') {
      s.input_tokens += m.tokens_in ?? 0
      s.output_tokens += m.tokens_out ?? 0
    }
    return m
  }

  const glossOf = (text: string, lang: Language) => (lang === 'en' ? text : `[es→en] ${text}`)

  // ---- profile generation (mock of §8) ----
  const generateProfile = (s: SessionRow): SessionProfileRow => {
    const map = mapOf(s)
    const mapRow = mapRowFor(store, s.construct_map_id)
    const p = participantOf(s)
    const active = activeConstructIds(map, p.diagnosis_code, focusOf(s))
    const evidence = store.evidence.filter((e) => e.session_id === s.id && !e.superseded_by)
    const findings = store.findings.filter((f) => f.session_id === s.id)
    const confirmedFocus = convoOf(s).confirmed
    const domains: ProfileDomain[] = []
    const needs: Profile['needs_clarification'] = []
    const declined: string[] = []
    const covered = new Set<string>()

    for (const d of map.domains) {
      const constructs: ProfileDomain['constructs'] = []
      for (const c of d.constructs) {
        const rows = evidence.filter((e) => e.construct_id === c.id)
        if (rows.length === 0) continue
        if (rows.some((r) => r.severity === 'declined')) {
          declined.push(c.id)
          constructs.push({ id: c.id, severity: 'declined', confidence: 1, quotes: [], findings: [], status: 'declined' })
          continue
        }
        const best = [...rows].sort((a, b) => b.confidence - a.confidence)[0]
        if (best.confidence < map.coverage_rules.min_confidence_to_count || best.severity === 'unclear') {
          needs.push({ construct_id: c.id, reason: 'Evidence below confidence threshold' })
          continue
        }
        covered.add(c.id)
        const fs = findings.filter((f) => f.construct_id === c.id)
        const seen = new Set(rows.flatMap((r) => r.facets))
        const all = c.facets ?? []
        constructs.push({
          id: c.id,
          severity: best.severity,
          confidence: best.confidence,
          quotes: rows.map((r) => ({ text: r.patient_quote, lang: s.language, gloss_en: r.quote_gloss_en })),
          findings: fs.map((f) => ({ category: f.category, text: f.finding })),
          status: fs.length >= 2 ? 'drill_down_done' : 'covered',
          facets_covered: all.filter((x) => seen.has(x.id)).map((x) => x.id),
          facets_missing: all.filter((x) => !seen.has(x.id)).map((x) => x.id),
          confirmed: confirmedFocus.includes(c.id),
        })
      }
      if (constructs.length === 0) continue
      const agg = aggregateDomainSeverity(constructs.map((c) => c.severity))
      const conf = constructs.filter((c) => c.status !== 'declined')
      domains.push({
        id: d.id,
        label: d.label,
        severity: agg.severity,
        confidence: conf.length ? Math.round((conf.reduce((n, c) => n + c.confidence, 0) / conf.length) * 100) / 100 : 0,
        summary_en: `${conf.length} construct(s) discussed${agg.worst ? `; worst: ${agg.worst}` : ''}.`,
        constructs,
      })
    }

    // Change vs prior completed session at an earlier timepoint.
    const idx = TIMEPOINTS.indexOf(s.timepoint)
    const prior = store.sessions
      .filter((x) => x.participant_id === s.participant_id && x.id !== s.id && x.status === 'completed' && TIMEPOINTS.indexOf(x.timepoint) < idx)
      .sort((a, b) => TIMEPOINTS.indexOf(b.timepoint) - TIMEPOINTS.indexOf(a.timepoint))[0]
    const change: Profile['change_from_prior'] = []
    if (prior) {
      const pp = store.profiles.find((x) => x.session_id === prior.id)
      for (const d of domains)
        for (const c of d.constructs) {
          const before = pp?.profile.domains.flatMap((x) => x.constructs).find((x) => x.id === c.id)
          if (before && before.severity !== c.severity && c.severity !== 'declined' && before.severity !== 'declined')
            change.push({ construct_id: c.id, prior: before.severity, now: c.severity, note: 'Compared with ' + prior.timepoint })
        }
    }

    const questions = findings.filter((f) => f.category === 'patient_question').map((f) => f.finding)
    const profile: Profile = {
      generated_with: { model: s.model_id, prompt_version: s.prompt_version, map: `${mapRow?.slug ?? 'map'}@${mapRow?.version ?? 1}` },
      domains,
      needs_clarification: needs,
      not_covered: active.filter((id) => !covered.has(id) && !declined.includes(id) && !needs.some((n) => n.construct_id === id)),
      declined,
      patient_questions: questions,
      change_from_prior: change,
      disclaimer: 'AI-assisted inferred profile. Not a validated FACE-Q score.',
    }

    // The map is English-only by design (SPEC §3); the real backend writes the summary in the
    // patient's language, so the mock uses per-domain Spanish labels instead of construct labels.
    const lines: string[] = []
    for (const d of domains) {
      const domainLabel = s.language === 'es' ? (DOMAIN_LABELS_ES[d.id] ?? d.label) : d.label
      for (const c of d.constructs) {
        const label = s.language === 'es' ? domainLabel : (findConstruct(map, c.id)?.construct.label ?? c.id)
        if (c.status === 'declined') lines.push(s.language === 'es' ? `• Prefirió no hablar de: ${label.toLowerCase()}.` : `• You preferred not to talk about: ${label.toLowerCase()}.`)
        else if (c.quotes[0]) lines.push(`• ${label}: "${c.quotes[0].text}"`)
      }
    }
    const summary =
      s.language === 'es'
        ? `Esto es lo que entendí:\n${lines.join('\n')}\n\n¿Lo he entendido bien? Puede corregir lo que quiera.`
        : `Here's what I heard:\n${lines.join('\n')}\n\nDid I get this right? You can correct anything.`

    const row: SessionProfileRow = {
      session_id: s.id,
      profile,
      patient_summary: summary,
      patient_summary_confirmed_at: null,
      patient_corrections: null,
      generated_at: now(),
    }
    store.profiles = store.profiles.filter((x) => x.session_id !== s.id)
    store.profiles.push(row)
    return row
  }

  const api: Api = {
    // ---------------- patient ----------------
    async sessionState(token) {
      await sleep(250)
      return stateOf(sessionByToken(token))
    },
    async consent(token, variant) {
      await sleep(250)
      const s = sessionByToken(token)
      if (s.status === 'intake') s.status = 'consented'
      s.consent_given_at = now()
      s.consent_variant = variant
      persist()
      return stateOf(s)
    },
    async submitScreen(token, scores) {
      await sleep(250)
      const s = sessionByToken(token)
      if (s.status !== 'consented') throw new ApiError('Screen must be answered after consent', { code: 'invalid_status', status: 409 })
      if (s.screen_completed_at) throw new ApiError('Already submitted', { code: 'already_submitted', status: 409 })
      const p = participantOf(s)
      const items = SCREEN_ITEMS.filter((i) => i.population === (isMinor(p.age_band) ? 'pediatric' : 'adult'))
      for (const item of items) {
        const v = scores[item.id]
        if (!Number.isInteger(v) || v < 0 || v > 10) throw new ApiError(`Missing score for ${item.id}`, { code: 'bad_request', status: 400 })
      }
      s.screen_scores = scores
      s.screen_completed_at = now()
      // Lowest scores first become the focus (≤6, at least three, cap eight).
      const ranked = items.map((i) => ({ id: i.construct_id, score: scores[i.id] })).sort((a, b) => a.score - b.score)
      const low = ranked.filter((r) => r.score <= 6)
      const picked = (low.length >= 3 ? low : ranked.slice(0, 3)).map((r) => r.id)
      const first = [...new Set([...focusOf(s), ...picked])][0] ?? null
      store.convo[s.id] = { phase: 'explore', current_focus: first, confirmed: [] }
      persist()
      return stateOf(s)
    },
    async updateIntake(token, fields) {
      await sleep(250)
      const s = sessionByToken(token)
      const p = participantOf(s)
      Object.assign(p, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)))
      if (fields.preferred_language && (s.status === 'intake' || s.status === 'consented')) s.language = fields.preferred_language
      persist()
      return stateOf(s)
    },

    async chatTurn(sessionId, token, text, inputMode, signal) {
      await sleep(300)
      const s = sessionByToken(token)
      if (s.id !== sessionId) throw new ApiError('Session mismatch', { code: 'invalid_session', status: 400 })
      const p = participantOf(s)
      const script = SCRIPTS[s.language]
      const frames: SseFrame[] = []
      const status = (): SseFrame => ({
        event: 'status',
        data: {
          coverage: coverageOf(s),
          phase: convoOf(s).phase,
          current_focus: convoOf(s).current_focus,
          focus_progress: focusProgressOf(s),
          turns_used: turnsUsed(s),
          max_turns: s.max_turns,
        },
      })
      const say = (reply: string) => {
        addMessage(s, 'assistant', reply)
        frames.push(...tokenFrames(reply, reply.length))
      }

      if (s.status === 'safety-halted') {
        frames.push({ event: 'safety', data: { message: script.safety } })
        return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
      }
      if (s.status !== 'consented' && s.status !== 'active' && s.status !== 'wrapping-up') {
        throw new ApiError('Session is not active', { code: 'invalid_state', status: 409 })
      }

      if (text === null) {
        // Opening message; idempotent on resume.
        if (s.status === 'consented') {
          s.status = 'active'
          s.started_at = s.started_at ?? now()
          say(script.opening(p.display_name))
          store.scriptPos[s.id] = 0
          store.lastAsks[s.id] = ['appearance.overall']
          store.convo[s.id] = { phase: 'triage', current_focus: null, confirmed: [] }
        }
        frames.push(status())
        persist()
        return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
      }

      // Hidden test hook: "!fail" simulates one retryable failure to exercise the retry path.
      if (text.trim() === '!fail' && !failOnce) {
        failOnce = true
        frames.push({ event: 'error', data: { retryable: true, message: 'Simulated transient failure' }, delay: 200 })
        return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
      }
      failOnce = false

      const patientMsg = addMessage(s, 'patient', text, inputMode)

      if (detectSafety(text, s.language)) {
        store.safety_flags.push({
          id: uid(),
          session_id: s.id,
          message_id: patientMsg.id,
          trigger: 'self_harm',
          detected_by: 'keyword',
          action_taken: 'fixed_message_shown; session halted',
          reviewed_by: null,
          reviewed_at: null,
          created_at: now(),
        })
        s.status = 'safety-halted'
        store.convo[s.id] = { ...convoOf(s), current_focus: null }
        addMessage(s, 'system-event', 'safety_intercept')
        addMessage(s, 'assistant', script.safety)
        persist()
        frames.push({ event: 'safety', data: { message: script.safety }, delay: 400 })
        return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
      }

      const pos = Math.min(store.scriptPos[s.id] ?? 0, script.turns.length - 1)
      const askedIds = store.lastAsks[s.id] ?? ['appearance.overall']
      const turn = script.turns[pos]
      const lastScripted = pos >= script.turns.length - 1
      const control = detectControlPhrase(text, s.language)

      // v1.1 §C: extraction runs *after* the reply, so evidence frames follow the tokens.
      const evidenceFrames: SseFrame[] = []

      const advance = (prefix = '') => {
        say(`${prefix}${turn.reply}`)
        store.lastAsks[s.id] = turn.asks
        store.scriptPos[s.id] = pos + 1
        const prev = convoOf(s)
        store.convo[s.id] = {
          phase: turn.phase,
          current_focus: turn.focus ?? null,
          confirmed: turn.confirms && !prev.confirmed.includes(turn.confirms) ? [...prev.confirmed, turn.confirms] : prev.confirmed,
        }
        frames.push(...evidenceFrames)
        frames.push(status())
        if (lastScripted) {
          s.status = 'wrapping-up'
          frames.push({ event: 'ended', data: { reason: 'coverage_complete' }, delay: 300 })
        }
      }

      if (control === 'pause') {
        addMessage(s, 'system-event', 'pause_requested')
        say(script.breakAck)
        frames.push(status())
        persist()
        return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
      }
      if (control === 'stop') {
        addMessage(s, 'system-event', 'stop_requested')
        say(script.stopAck)
        s.status = 'wrapping-up'
        store.convo[s.id] = { ...convoOf(s), phase: 'wrap-up', current_focus: null }
        frames.push(status(), { event: 'ended', data: { reason: 'patient_requested' }, delay: 300 })
        persist()
        return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
      }
      if (control === 'skip') {
        for (const id of askedIds) {
          store.evidence.push({
            id: uid(), session_id: s.id, construct_id: id, message_id: patientMsg.id,
            patient_quote: text, quote_gloss_en: glossOf(text, s.language), severity: 'declined', confidence: 1,
            interference: [], facets: [], triage_item: null, note: 'patient skipped', superseded_by: null, created_at: now(),
          })
        }
        addMessage(s, 'system-event', `declined:${askedIds.join(',')}`)
        advance(`${script.skipAck} `)
        persist()
        return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
      }

      // Record evidence for the constructs the assistant just asked about.
      const evidenceIds = askedIds.slice(0, 2)
      for (const id of evidenceIds) {
        const scripted = turn.evidence?.find((e) => e.construct_id === id)
        const quote = text.length > 140 ? text.slice(0, 140) + '…' : text
        const row: ConstructEvidenceRow = {
          id: uid(), session_id: s.id, construct_id: id, message_id: patientMsg.id,
          patient_quote: quote, quote_gloss_en: glossOf(quote, s.language),
          severity: scripted?.severity ?? 'mild', confidence: scripted?.confidence ?? 0.7,
          interference: [], facets: scripted?.facets ?? [], triage_item: scripted?.triage_item ?? null,
          note: null, superseded_by: null, created_at: now(),
        }
        store.evidence.push(row)
        evidenceFrames.push({ event: 'evidence', data: { construct_id: id, severity: row.severity, confidence: row.confidence }, delay: 150 })
        if (row.severity === 'moderate' || row.severity === 'severe') {
          store.findings.push({ id: uid(), session_id: s.id, construct_id: id, category: 'impact', finding: text.slice(0, 120), message_id: patientMsg.id, created_at: now() })
        }
      }
      if (/\?\s*$/.test(text)) {
        store.findings.push({ id: uid(), session_id: s.id, construct_id: evidenceIds[0] ?? 'general', category: 'patient_question', finding: text, message_id: patientMsg.id, created_at: now() })
      }

      if (turnsUsed(s) + 1 >= s.max_turns && !lastScripted) {
        say(script.wrapUp)
        s.status = 'wrapping-up'
        store.convo[s.id] = { ...convoOf(s), phase: 'wrap-up', current_focus: null }
        frames.push(...evidenceFrames, status(), { event: 'ended', data: { reason: 'turn_budget' }, delay: 300 })
      } else {
        advance()
      }
      persist()
      return fakeSseStream(frames, { signal, speed: STREAM_SPEED })
    },

    async endSession(token) {
      await sleep(900)
      const s = sessionByToken(token)
      const row = generateProfile(s)
      s.status = 'summary-review'
      s.ended_at = now()
      persist()
      return { status: 'summary-review', patient_summary: row.patient_summary }
    },

    async confirmSummary(token, corrections) {
      await sleep(400)
      const s = sessionByToken(token)
      const profile = store.profiles.find((x) => x.session_id === s.id)
      for (const c of corrections) {
        const id = c.construct_id ?? 'general'
        const old = [...store.evidence].reverse().find((e) => e.session_id === s.id && e.construct_id === id && !e.superseded_by)
        const row: ConstructEvidenceRow = {
          id: uid(), session_id: s.id, construct_id: id, message_id: null,
          patient_quote: c.patient_text, quote_gloss_en: glossOf(c.patient_text, s.language),
          severity: old?.severity ?? 'unclear', confidence: old?.confidence ?? 0.5, interference: [],
          facets: old?.facets ?? [], triage_item: null,
          note: 'patient correction at summary review', superseded_by: null, created_at: now(),
        }
        if (old) old.superseded_by = row.id
        store.evidence.push(row)
      }
      if (profile) {
        profile.patient_corrections = corrections
        profile.patient_summary_confirmed_at = now()
      }
      s.status = 'completed'
      persist()
      return { status: 'completed' }
    },

    async diagnosisCatalog() {
      return DIAGNOSIS_CATALOG
    },

    // ---------------- auth ----------------
    async getUser() {
      return currentUser()
    },
    onAuthChange(cb) {
      authListeners.push(cb)
      return () => {
        authListeners = authListeners.filter((l) => l !== cb)
      }
    },
    async signInWithMagicLink() {
      await sleep(400)
      // Mock: pretend the email was sent; the demo button signs in directly.
    },
    async signInAsDemo() {
      await sleep(200)
      setUser(DEMO_USER)
      return DEMO_USER
    },
    async signOut() {
      setUser(null)
    },

    // ---------------- clinician ----------------
    async listParticipants() {
      requireUser()
      await sleep(200)
      return store.participants
        .filter((p) => !p.deleted_at)
        .map((p) => {
          const mine = store.sessions.filter((s) => s.participant_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
          const completed = mine.filter((s) => s.status === 'completed').map((s) => s.timepoint)
          return {
            participant: p,
            timepoints_completed: TIMEPOINTS.filter((t) => completed.includes(t)),
            last_session_status: mine[0]?.status ?? null,
            last_session_at: mine[0]?.created_at ?? null,
            flag_count: store.safety_flags.filter((f) => mine.some((s) => s.id === f.session_id)).length,
          }
        })
    },

    async participantTimeline(participantId) {
      requireUser()
      await sleep(200)
      const participant = store.participants.find((p) => p.id === participantId && !p.deleted_at)
      if (!participant) throw new ApiError('Participant not found', { code: 'not_found', status: 404 })
      const sessions = store.sessions
        .filter((s) => s.participant_id === participantId)
        .sort((a, b) => TIMEPOINTS.indexOf(a.timepoint) - TIMEPOINTS.indexOf(b.timepoint) || a.created_at.localeCompare(b.created_at))
      return {
        participant,
        sessions: sessions.map((session) => ({
          session,
          profile: store.profiles.find((p) => p.session_id === session.id) ?? null,
          flag_count: store.safety_flags.filter((f) => f.session_id === session.id).length,
        })),
      }
    },

    async sessionDetail(sessionId) {
      requireUser()
      await sleep(250)
      const session = store.sessions.find((s) => s.id === sessionId)
      if (!session) throw new ApiError('Session not found', { code: 'not_found', status: 404 })
      const idx = TIMEPOINTS.indexOf(session.timepoint)
      const prior = store.sessions
        .filter((x) => x.participant_id === session.participant_id && x.id !== session.id && x.status === 'completed' && TIMEPOINTS.indexOf(x.timepoint) < idx)
        .sort((a, b) => TIMEPOINTS.indexOf(b.timepoint) - TIMEPOINTS.indexOf(a.timepoint))[0]
      return {
        session,
        participant: participantOf(session),
        messages: store.messages.filter((m) => m.session_id === sessionId).sort((a, b) => a.seq - b.seq),
        evidence: store.evidence.filter((e) => e.session_id === sessionId),
        findings: store.findings.filter((f) => f.session_id === sessionId),
        profile: store.profiles.find((p) => p.session_id === sessionId) ?? null,
        safety_flags: store.safety_flags.filter((f) => f.session_id === sessionId),
        clinician_notes: store.clinician_notes.filter((n) => n.session_id === sessionId),
        construct_map: mapRowFor(store, session.construct_map_id),
        prior_session: prior ? { session: prior, profile: store.profiles.find((p) => p.session_id === prior.id) ?? null } : null,
      }
    },

    async listConstructMaps() {
      requireUser()
      await sleep(150)
      return [...CONSTRUCT_MAP_ROWS, ...store.draftMaps]
    },
    async listInstruments() {
      requireUser()
      await sleep(150)
      return INSTRUMENT_ROWS
    },

    async startSession(input) {
      requireUser()
      await sleep(400)
      let participant = input.participant.study_id
        ? store.participants.find((p) => p.study_id === input.participant.study_id && !p.deleted_at)
        : undefined
      if (!participant) {
        const n = store.participants.length + 1
        participant = {
          id: uid(),
          study_id: input.participant.study_id || `P-${String(n).padStart(4, '0')}`,
          display_name: input.participant.display_name,
          preferred_language: input.participant.preferred_language,
          age_band: input.participant.age_band,
          reading_comfort: input.participant.reading_comfort,
          diagnosis_code: input.participant.diagnosis_code,
          diagnosis_text: input.participant.diagnosis_text,
          is_demo: false,
          deleted_at: null,
          created_at: now(),
        }
        store.participants.push(participant)
      }
      const mapSlug = isMinor(participant.age_band) ? 'face-q-pediatric' : 'face-q-adult'
      const mapRow = CONSTRUCT_MAP_ROWS.find((m) => m.slug === mapSlug)!
      const session: SessionRow = {
        id: uid(),
        participant_id: participant.id,
        timepoint: input.timepoint,
        respondent: input.respondent,
        language: participant.preferred_language,
        construct_map_id: mapRow.id,
        prompt_version: 'v1.0.0',
        model_id: 'claude-sonnet-5',
        status: 'intake',
        max_turns: 12,
        target_minutes: 12,
        started_at: null,
        ended_at: null,
        consent_given_at: null,
        consent_variant: null,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_estimate: null,
        created_at: now(),
      }
      store.sessions.push(session)
      if (input.clinician_note && (input.clinician_note.note || input.clinician_note.focus_constructs.length)) {
        store.clinician_notes.push({
          id: uid(), session_id: session.id, clinician_id: DEMO_USER.id,
          note: input.clinician_note.note, focus_constructs: input.clinician_note.focus_constructs, created_at: now(),
        })
      }
      const token = randomToken()
      store.tokens[token] = session.id
      persist()
      return {
        session_id: session.id,
        participant_id: participant.id,
        study_id: participant.study_id,
        resume_token: token,
        patient_link_path: `/p/${token}`,
      }
    },

    async exportSession(sessionId, format) {
      requireUser()
      await sleep(300)
      const detail = await api.sessionDetail(sessionId)
      if (format === 'csv') return new Blob([buildCsv(detail)], { type: 'text/csv;charset=utf-8' })
      return new Blob([JSON.stringify(buildFhirBundle(detail), null, 2)], { type: 'application/fhir+json' })
    },

    async deleteParticipant(participantId) {
      requireUser()
      await sleep(300)
      const sessions = store.sessions.filter((s) => s.participant_id === participantId).map((s) => s.id)
      const inS = (id: string) => sessions.includes(id)
      store.messages = store.messages.filter((m) => !inS(m.session_id))
      store.evidence = store.evidence.filter((e) => !inS(e.session_id))
      store.findings = store.findings.filter((f) => !inS(f.session_id))
      store.profiles = store.profiles.filter((p) => !inS(p.session_id))
      store.safety_flags = store.safety_flags.filter((f) => !inS(f.session_id))
      store.clinician_notes = store.clinician_notes.filter((n) => !inS(n.session_id))
      store.sessions = store.sessions.filter((s) => s.participant_id !== participantId)
      store.participants = store.participants.filter((p) => p.id !== participantId)
      for (const [t, sid] of Object.entries(store.tokens)) if (inS(sid)) delete store.tokens[t]
      persist()
    },

    async reopenSession(sessionId) {
      requireUser()
      await sleep(300)
      const s = store.sessions.find((x) => x.id === sessionId)
      if (!s) throw new ApiError('Session not found', { code: 'not_found', status: 404 })
      s.status = 'active'
      for (const f of store.safety_flags.filter((f) => f.session_id === sessionId && !f.reviewed_at)) {
        f.reviewed_by = DEMO_USER.id
        f.reviewed_at = now()
      }
      persist()
    },

    async ingestInstrument(input) {
      requireUser()
      await sleep(1200)
      // v1.1 §E: merge into the latest approved map for this population rather than replacing
      // it. Headings become facets on the construct they best match, or a new construct when
      // nothing in the map covers them. Item text is never copied: labels are rewritten.
      const base = latestMapFor(input.population)
      const sections = input.text
        .split(/\n\s*\n|\r\n\s*\r\n/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
        .slice(0, 12)

      const merged: ConstructMap = structuredClone(base.map)
      const diff: IngestDiff = { facets_added: 0, constructs_added: [], triage_added: 0 }
      const added: ConstructDef[] = []

      for (const [i, sec] of sections.entries()) {
        const heading = sec.split(/\n/)[0].replace(/[:.]+$/, '').slice(0, 60) || `Section ${i + 1}`
        const target = bestMatch(merged, heading)
        if (target) {
          const facet: FacetDef = { id: slugify(heading).slice(0, 40) || `facet_${i + 1}`, label: paraphraseFacet(heading) }
          target.facets ??= []
          if (!target.facets.some((x) => x.id === facet.id)) {
            target.facets.push(facet)
            diff.facets_added += 1
          }
        } else {
          const id = 'proposed.' + (slugify(heading).slice(0, 40) || `section_${i + 1}`)
          if (added.some((c) => c.id === id)) continue
          added.push({
            id,
            label: heading,
            description: `What matters to understand about the person regarding "${heading.toLowerCase()}" (paraphrased; derived from ${sec.split(/\n/).length} lines of source text).`,
            severity_signals: { none: 'no concern', mild: 'occasional concern', moderate: 'regular concern with some interference', severe: 'persistent distress affecting daily life' },
            drill_down: ['Onset and trajectory', 'Situations where it is worse', 'Impact on daily life'],
            facets: [
              { id: 'since_when', label: 'How long it has been like this' },
              { id: 'when_worst', label: 'Situations where it is worse' },
              { id: 'impact', label: 'What it stops them doing' },
              { id: 'wanted_change', label: 'What they would want different' },
            ],
            priority: 'standard',
            source_refs: [{ instrument: input.instrument_slug, scale: heading }],
          })
          diff.constructs_added.push(id)
        }
      }

      if (added.length > 0) {
        const domain = merged.domains.find((d) => d.id === 'proposed')
        if (domain) domain.constructs.push(...added)
        else merged.domains.push({ id: 'proposed', label: 'Proposed constructs (review before approval)', weight: 1, constructs: added })
      }

      // Suggested triage intents: one per new construct group, capped, never duplicated.
      merged.triage ??= []
      for (const t of suggestTriage(added)) {
        if (!merged.triage.some((x) => x.id === t.id)) {
          merged.triage.push(t)
          diff.triage_added += 1
        }
      }

      const version = Math.max(...[...CONSTRUCT_MAP_ROWS, ...store.draftMaps].filter((m) => m.slug === base.slug).map((m) => m.version)) + 1
      merged.version = version
      const row: ConstructMapRow = {
        id: uid(),
        slug: base.slug,
        version,
        population: input.population,
        source_instrument_ids: [
          ...new Set([...base.source_instrument_ids, ...INSTRUMENT_ROWS.filter((i) => i.slug === input.instrument_slug).map((i) => i.id)]),
        ],
        map: merged,
        status: 'draft',
        approved_by: null,
        approved_at: null,
        created_at: now(),
      }
      store.draftMaps.push(row)
      persist()
      return { construct_map: row, diff }
    },

    async approveConstructMap(id) {
      requireUser()
      await sleep(300)
      const row = store.draftMaps.find((m) => m.id === id)
      if (!row) throw new ApiError('Draft not found', { code: 'not_found', status: 404 })
      row.status = 'approved'
      row.approved_by = DEMO_USER.id
      row.approved_at = now()
      persist()
      return row
    },
  }

  // Expose a reset for the demo toolbar.
  ;(api as Api & { reset?: () => void }).reset = () => {
    resetMockStore()
    store = buildDemoStore()
  }
  return api
}
