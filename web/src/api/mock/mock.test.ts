import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatEvent } from '../../types'
import { chatEvents } from '../sse'
import { createMockApi, resetMockStore } from './index'

// jsdom's Blob has no text(); read it the old way.
const blobText = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsText(b)
  })

async function turn(api: ReturnType<typeof createMockApi>, sessionId: string, token: string, text: string | null) {
  const out: ChatEvent[] = []
  for await (const ev of chatEvents(await api.chatTurn(sessionId, token, text, text === null ? null : 'text'))) out.push(ev)
  const text_ = out.filter((e) => e.event === 'token').map((e) => (e as { data: { t: string } }).data.t).join('')
  const status = [...out].reverse().find((e) => e.event === 'status') as Extract<ChatEvent, { event: 'status' }> | undefined
  return { events: out, text: text_, names: out.map((e) => e.event), status: status?.data }
}

async function startEnglishSession(api: ReturnType<typeof createMockApi>) {
  await api.signInAsDemo()
  const started = await api.startSession({
    participant: { display_name: 'Sam', preferred_language: 'en', age_band: '30-49', reading_comfort: 'comfortable', diagnosis_code: 'rhinoplasty', diagnosis_text: '' },
    timepoint: 'baseline',
    respondent: 'self',
  })
  await api.consent(started.resume_token, 'adult')
  return started
}

describe('mock API end to end', () => {
  beforeEach(() => {
    resetMockStore()
    sessionStorage.clear()
  })

  it('runs the scripted Spanish conversation through consent, skip, safety-free completion and summary', async () => {
    const api = createMockApi()
    await api.signInAsDemo()
    const started = await api.startSession({
      participant: { study_id: 'P-0002', display_name: 'Lucía', preferred_language: 'es', age_band: '50-69', reading_comfort: 'short-messages', diagnosis_code: 'facelift', diagnosis_text: '' },
      timepoint: 'post-op-6w',
      respondent: 'self',
      clinician_note: { note: 'check neck', focus_constructs: ['appearance.jawline'] },
    })
    expect(started.patient_link_path).toBe(`/p/${started.resume_token}`)
    const token = started.resume_token

    let s = await api.sessionState(token)
    expect(s.status).toBe('intake')
    expect(s.consent_variant_needed).toBe('adult')
    s = await api.consent(token, 'adult')
    expect(s.status).toBe('consented')
    s = await api.updateIntake(token, { display_name: 'Lucía', preferred_language: 'es' })

    const opening = await turn(api, s.session_id, token, null)
    expect(opening.text).toMatch(/Hola Lucía/)
    expect(opening.names).toContain('status')
    expect((await api.sessionState(token)).status).toBe('active')

    const t1 = await turn(api, s.session_id, token, 'Me veo cansada, el cuello sobre todo.')
    expect(t1.names).toContain('evidence')
    expect(t1.text.length).toBeGreaterThan(10)

    const skip = await turn(api, s.session_id, token, 'saltar')
    expect(skip.text).toMatch(/Sin problema/)
    const stateAfterSkip = await api.sessionState(token)
    expect(stateAfterSkip.coverage.covered).toBeGreaterThan(0)

    const pause = await turn(api, s.session_id, token, 'Necesito una pausa')
    expect(pause.text).toMatch(/tómese el tiempo/)
    expect(pause.names).not.toContain('ended')

    // Keep answering until the script ends.
    let ended: ChatEvent | undefined
    for (let i = 0; i < 12 && !ended; i++) {
      const r = await turn(api, s.session_id, token, `Respuesta ${i}`)
      ended = r.events.find((e) => e.event === 'ended')
    }
    expect(ended).toBeDefined()
    expect((await api.sessionState(token)).status).toBe('wrapping-up')

    const end = await api.endSession(token)
    expect(end.status).toBe('summary-review')
    expect(end.patient_summary).toMatch(/¿Lo he entendido bien\?/)

    const done = await api.confirmSummary(token, [{ construct_id: null, patient_text: 'Es la barbilla, no la nariz' }])
    expect(done.status).toBe('completed')

    const detail = await api.sessionDetail(s.session_id)
    expect(detail.profile?.patient_corrections).toHaveLength(1)
    expect(detail.profile?.profile.declined.length).toBeGreaterThan(0)
    expect(detail.profile?.profile.change_from_prior.length).toBeGreaterThan(0)
    expect(detail.clinician_notes[0].focus_constructs).toEqual(['appearance.jawline'])
    expect(detail.messages.some((m) => m.role === 'system-event' && m.content.startsWith('declined:'))).toBe(true)

    const csv = await blobText(await api.exportSession(s.session_id, 'csv'))
    expect(csv.split('\r\n')[0]).toBe('study_id,timepoint,domain,construct,severity,confidence,quote,gloss,findings,status')
    const fhir = JSON.parse(await blobText(await api.exportSession(s.session_id, 'fhir')))
    expect(fhir.resourceType).toBe('Bundle')
    expect(fhir.entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType)).toEqual(expect.arrayContaining(['Patient', 'Encounter', 'Observation', 'Composition']))
    expect(JSON.stringify(fhir)).not.toMatch(/QuestionnaireResponse/)
  })

  it('intercepts a safety phrase deterministically and halts the session until reopened', async () => {
    const api = createMockApi()
    await api.signInAsDemo()
    const started = await api.startSession({
      participant: { display_name: 'Test', preferred_language: 'en', age_band: '18-29', reading_comfort: 'comfortable', diagnosis_code: 'other', diagnosis_text: '' },
      timepoint: 'baseline',
      respondent: 'self',
    })
    const token = started.resume_token
    await api.consent(token, 'adult')
    await turn(api, started.session_id, token, null)
    const r = await turn(api, started.session_id, token, 'Some days I want to kill myself')
    expect(r.names).toEqual(['safety'])
    expect((await api.sessionState(token)).status).toBe('safety-halted')
    const detail = await api.sessionDetail(started.session_id)
    expect(detail.safety_flags).toHaveLength(1)
    expect(detail.safety_flags[0].detected_by).toBe('keyword')
    await api.reopenSession(started.session_id)
    expect((await api.sessionState(token)).status).toBe('active')
    expect((await api.sessionDetail(started.session_id)).safety_flags[0].reviewed_at).not.toBeNull()
  })

  it('derives the consent variant from age band and respondent, and lists demo data', async () => {
    const api = createMockApi()
    await api.signInAsDemo()
    const list = await api.listParticipants()
    expect(list.map((p) => p.participant.study_id)).toEqual(['P-0001', 'P-0002', 'P-0003'])
    expect(list[0].timepoints_completed).toEqual(['baseline', 'post-op-6w'])

    const minor = await api.startSession({
      participant: { display_name: 'Kid', preferred_language: 'en', age_band: '8-12', reading_comfort: 'short-messages', diagnosis_code: 'cleft-lip-palate', diagnosis_text: '' },
      timepoint: 'baseline',
      respondent: 'self',
    })
    expect((await api.sessionState(minor.resume_token)).consent_variant_needed).toBe('minor-assent')
    const guardian = await api.startSession({
      participant: { study_id: 'P-0003', display_name: 'Kai', preferred_language: 'en', age_band: '8-12', reading_comfort: 'short-messages', diagnosis_code: 'cleft-lip-palate', diagnosis_text: '' },
      timepoint: 'post-op-6w',
      respondent: 'guardian',
    })
    expect((await api.sessionState(guardian.resume_token)).consent_variant_needed).toBe('guardian')

    await api.deleteParticipant(minor.participant_id)
    await expect(api.sessionState(minor.resume_token)).rejects.toThrow(/Invalid/)
  })
})

describe('mock conversation phases (v1.1 §B/§C)', () => {
  beforeEach(() => {
    resetMockStore()
    sessionStorage.clear()
  })

  it('walks triage → explore with a confirm step, and reports phase on every status', async () => {
    const api = createMockApi()
    const { session_id, resume_token } = await startEnglishSession(api)

    const opening = await turn(api, session_id, resume_token, null)
    expect(opening.status?.phase).toBe('triage')
    expect(opening.status?.current_focus).toBeNull()
    expect(opening.status?.focus_progress).toEqual({ confirmed: 0, total: 3 })

    // Four triage answers close out the opening screen.
    for (let i = 0; i < 3; i++) {
      const r = await turn(api, session_id, resume_token, `Triage answer ${i}`)
      expect(r.status?.phase).toBe('triage')
    }
    const toExplore = await turn(api, session_id, resume_token, 'It affects how I feel at work')
    expect(toExplore.status?.phase).toBe('explore')
    expect(toExplore.status?.current_focus).toBe('appearance.nose')
    expect(toExplore.status?.focus_progress).toEqual({ confirmed: 0, total: 3 })

    // Two facet questions, then the reflect-back question, then the patient confirms.
    await turn(api, session_id, resume_token, 'The side view mostly')
    const reflect = await turn(api, session_id, resume_token, 'The left side sits lower')
    expect(reflect.text).toMatch(/Have I got that right\?/)
    expect(reflect.status?.focus_progress.confirmed).toBe(0)

    const confirmed = await turn(api, session_id, resume_token, 'Yes, that is right')
    expect(confirmed.status?.focus_progress).toEqual({ confirmed: 1, total: 3 })
    expect(confirmed.status?.current_focus).toBe('function.breathing')

    // Session state mirrors the tracker for a resumed session.
    const state = await api.sessionState(resume_token)
    expect(state.phase).toBe('explore')
    expect(state.current_focus).toBe('function.breathing')
    expect(state.focus_progress).toEqual({ confirmed: 1, total: 3 })

    await turn(api, session_id, resume_token, 'The left side, and worse at night')
    const last = await turn(api, session_id, resume_token, 'Yes, exactly')
    expect(last.status?.phase).toBe('wrap-up')
    expect(last.status?.focus_progress.confirmed).toBe(2)
    expect(last.names).toContain('ended')
  })

  it('emits evidence after the reply text and before status, with facets and triage items', async () => {
    const api = createMockApi()
    const { session_id, resume_token } = await startEnglishSession(api)
    await turn(api, session_id, resume_token, null)

    const r = await turn(api, session_id, resume_token, 'I look tired all the time')
    const lastToken = r.names.lastIndexOf('token')
    const firstEvidence = r.names.indexOf('evidence')
    const status = r.names.indexOf('status')
    expect(firstEvidence).toBeGreaterThan(lastToken)
    expect(status).toBeGreaterThan(firstEvidence)

    const rows = (await api.sessionDetail(session_id)).evidence
    expect(rows.find((e) => e.construct_id === 'appearance.overall')?.triage_item).toBe('overall')

    // …and once exploring, evidence rows carry the facets they answered.
    for (const t of ['features', 'function', 'impact', 'the side view']) await turn(api, session_id, resume_token, t)
    const nose = (await api.sessionDetail(session_id)).evidence.filter((e) => e.construct_id === 'appearance.nose')
    expect(nose.flatMap((e) => e.facets)).toEqual(expect.arrayContaining(['shape', 'profile']))
  })

  it('generates a profile carrying facets covered / missing and the confirmed flag', async () => {
    const api = createMockApi()
    const { session_id, resume_token } = await startEnglishSession(api)
    await turn(api, session_id, resume_token, null)
    for (let i = 0; i < 9; i++) await turn(api, session_id, resume_token, `Answer ${i}`)
    await api.endSession(resume_token)

    const profile = (await api.sessionDetail(session_id)).profile?.profile
    const nose = profile?.domains.flatMap((d) => d.constructs).find((c) => c.id === 'appearance.nose')
    expect(nose?.confirmed).toBe(true)
    expect(nose?.facets_covered).toEqual(expect.arrayContaining(['shape', 'profile', 'symmetry']))
    expect(nose?.facets_missing).toEqual(expect.arrayContaining(['others_comments']))
    expect([...(nose?.facets_covered ?? []), ...(nose?.facets_missing ?? [])]).toHaveLength(7)
  })
})

describe('mock instrument ingestion (v1.1 §E)', () => {
  beforeEach(() => {
    resetMockStore()
    sessionStorage.clear()
  })

  it('merges into the latest approved adult map and returns a diff', async () => {
    const api = createMockApi()
    await api.signInAsDemo()
    const { construct_map, diff } = await api.ingestInstrument({
      instrument_slug: 'face-q-aesthetics',
      population: 'adult',
      text: 'Eyes and eyelids\nsome lines\n\nSleep quality\nmore lines',
    })
    expect(construct_map.slug).toBe('face-q-adult')
    expect(construct_map.version).toBe(2)
    expect(construct_map.status).toBe('draft')
    // The approved map's own constructs survive the merge.
    expect(construct_map.map.domains.flatMap((d) => d.constructs).length).toBeGreaterThan(20)
    expect(diff.facets_added).toBeGreaterThan(0)
    expect(diff.constructs_added).toEqual(['proposed.sleep_quality'])
    expect(diff.triage_added).toBe(1)

    const approved = await api.approveConstructMap(construct_map.id)
    expect(approved.status).toBe('approved')
  })
})
