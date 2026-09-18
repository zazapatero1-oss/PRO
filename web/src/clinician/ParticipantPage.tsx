import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { ErrorBox, Loading, SeverityDot } from '../components/ui'
import { config } from '../config'
import { DIAGNOSIS_CATALOG, diagnosisLabel } from '../data/diagnosisCatalog'
import { useT } from '../i18n'
import { copyText } from '../lib/download'
import { qrSvg } from '../lib/qr'
import type {
  AgeBand,
  ConstructMapRow,
  Language,
  Participant,
  ParticipantTimeline,
  ReadingComfort,
  Respondent,
  StartSessionResult,
  Timepoint,
} from '../types'
import { AGE_BANDS, LANGUAGES, READING_COMFORTS, RESPONDENTS, TIMEPOINTS } from '../types'

const MINOR_BANDS: AgeBand[] = ['under-8', '8-12', '13-17']

export function ParticipantPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const { t, lang } = useT()
  const [timeline, setTimeline] = useState<ParticipantTimeline | null>(null)
  const [maps, setMaps] = useState<ConstructMapRow[]>([])
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setError(null)
    const jobs: Promise<unknown>[] = [api.listConstructMaps().then(setMaps)]
    if (!isNew && id) jobs.push(api.participantTimeline(id).then(setTimeline))
    Promise.all(jobs).catch(setError)
  }, [id, isNew])
  useEffect(load, [load])

  if (error) {
    return (
      <main className="page page--wide" id="main">
        <ErrorBox error={error} onRetry={load} />
      </main>
    )
  }
  if (!isNew && !timeline) {
    return (
      <main className="page page--wide" id="main">
        <Loading />
      </main>
    )
  }

  const p = timeline?.participant ?? null
  const dx = p ? DIAGNOSIS_CATALOG.find((d) => d.code === p.diagnosis_code) : undefined

  return (
    <main className="page page--wide" id="main">
      <p className="small">
        <Link to="/clinician">← {t('clinician.nav.participants')}</Link>
      </p>
      {p ? (
        <>
          <h1>
            {p.study_id} <span className="muted" style={{ fontWeight: 400 }}>· {p.display_name}</span>
          </h1>
          <p className="muted small">
            {diagnosisLabel(dx, lang) || p.diagnosis_code}
            {p.diagnosis_text ? ` — ${p.diagnosis_text}` : ''} · {t(`enum.language.${p.preferred_language}`)} · {t(`enum.ageBand.${p.age_band}`)} ·{' '}
            {t(`enum.readingComfort.${p.reading_comfort}`)}
          </p>
        </>
      ) : (
        <>
          <h1>{t('clinician.participants.newParticipant')}</h1>
          <p className="muted small">{t('clinician.participant.newParticipantIntro')}</p>
        </>
      )}

      {timeline && <Timeline timeline={timeline} />}

      <NewSessionForm participant={p} maps={maps} onCreated={load} />
    </main>
  )
}

function Timeline({ timeline }: { timeline: ParticipantTimeline }) {
  const { t } = useT()
  return (
    <section className="card">
      <h2>{t('clinician.participant.timeline')}</h2>
      {timeline.sessions.length === 0 && <p className="muted">{t('clinician.participant.noSessions')}</p>}
      <ol className="timeline">
        {timeline.sessions.map(({ session: s, profile, flag_count }) => (
          <li key={s.id} className="timeline__item">
            <div className="timeline__main">
              <div className="row">
                <strong>{t(`enum.timepoint.${s.timepoint}`)}</strong>
                <span className="badge">{t(`enum.status.${s.status}`)}</span>
                {flag_count > 0 && (
                  <span className="badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                    {t('clinician.session.safetyFlags')}: {flag_count}
                  </span>
                )}
              </div>
              <div className="small muted">
                {new Date(s.created_at).toLocaleDateString()} · {t(`enum.respondent.${s.respondent}`)} · {t(`enum.language.${s.language}`)}
              </div>
              {profile ? (
                <div className="mini-sev">
                  {profile.profile.domains.map((d) => (
                    <span key={d.id} className="badge" title={`${d.label}: ${t(`enum.severity.${d.severity}`)}`}>
                      <SeverityDot severity={d.severity} />
                      {d.label.length > 22 ? d.label.slice(0, 22) + '…' : d.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="small muted">{t('clinician.participant.profileMissing')}</div>
              )}
            </div>
            <Link to={`/clinician/session/${s.id}`} className="btn btn--sm">
              {t('clinician.participant.view')}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

function NewSessionForm({ participant, maps, onCreated }: { participant: Participant | null; maps: ConstructMapRow[]; onCreated: () => void }) {
  const { t, lang } = useT()
  const [displayName, setDisplayName] = useState(participant?.display_name ?? '')
  const [language, setLanguage] = useState<Language>(participant?.preferred_language ?? 'en')
  const [ageBand, setAgeBand] = useState<AgeBand>(participant?.age_band ?? '30-49')
  const [reading, setReading] = useState<ReadingComfort>(participant?.reading_comfort ?? 'comfortable')
  const [dxCode, setDxCode] = useState(participant?.diagnosis_code ?? DIAGNOSIS_CATALOG[0].code)
  const [dxText, setDxText] = useState(participant?.diagnosis_text ?? '')
  const [timepoint, setTimepoint] = useState<Timepoint>('baseline')
  const [respondent, setRespondent] = useState<Respondent>('self')
  const [note, setNote] = useState('')
  const [focus, setFocus] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<StartSessionResult | null>(null)
  const [copied, setCopied] = useState(false)

  const population = MINOR_BANDS.includes(ageBand) ? 'pediatric' : 'adult'
  const map = useMemo(
    () => maps.filter((m) => m.status === 'approved' && m.population === population).sort((a, b) => b.version - a.version)[0] ?? null,
    [maps, population],
  )
  const dxDefaults = DIAGNOSIS_CATALOG.find((d) => d.code === dxCode)?.focus_constructs ?? []

  const toggle = (id: string) => setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api.startSession({
        participant: {
          study_id: participant?.study_id ?? null,
          display_name: displayName.trim(),
          preferred_language: language,
          age_band: ageBand,
          reading_comfort: reading,
          diagnosis_code: dxCode,
          diagnosis_text: dxText.trim(),
        },
        timepoint,
        respondent,
        clinician_note: note.trim() || focus.length ? { note: note.trim(), focus_constructs: focus } : undefined,
      })
      setResult(r)
      onCreated()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    // The token is only ever shown here; it is not persisted client-side.
    const path = result.patient_link_path.replace(/^\//, '')
    const url = new URL(config.basePath + path, window.location.origin).toString()
    return (
      <section className="card" aria-live="polite">
        <h2>{t('clinician.participant.linkTitle')}</h2>
        <p className="alert alert--warn">{t('clinician.participant.linkOnce')}</p>
        <p className="mono wrap">{url}</p>
        <div className="qr" dangerouslySetInnerHTML={{ __html: qrSvg(url) }} aria-label="QR code" role="img" />
        <div className="row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={async () => {
              setCopied(await copyText(url))
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? t('common.copied') : t('clinician.participant.copyLink')}
          </button>
          <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
            {t('clinician.participant.openLink')}
          </a>
          {!participant && (
            <Link className="btn" to={`/clinician/participant/${result.participant_id}`}>
              {result.study_id}
            </Link>
          )}
          <button type="button" className="btn" onClick={() => setResult(null)}>
            {t('clinician.participant.done')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{t('clinician.participant.newSession')}</h2>
      {error ? <ErrorBox error={error} /> : null}

      {!participant && (
        <>
          <label className="field">
            <span className="field__label">{t('clinician.participant.displayName')}</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={40} />
          </label>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span className="field__label">{t('clinician.participant.preferredLanguage')}</span>
              <select className="select" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {t(`enum.language.${l}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span className="field__label">{t('clinician.participant.ageBand')}</span>
              <select className="select" value={ageBand} onChange={(e) => setAgeBand(e.target.value as AgeBand)}>
                {AGE_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {t(`enum.ageBand.${b}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span className="field__label">{t('clinician.participant.readingComfort')}</span>
              <select className="select" value={reading} onChange={(e) => setReading(e.target.value as ReadingComfort)}>
                {READING_COMFORTS.map((r) => (
                  <option key={r} value={r}>
                    {t(`enum.readingComfort.${r}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <label className="field" style={{ flex: 1, minWidth: 200 }}>
              <span className="field__label">{t('clinician.participant.diagnosis')}</span>
              <select className="select" value={dxCode} onChange={(e) => setDxCode(e.target.value)}>
                {DIAGNOSIS_CATALOG.map((d) => (
                  <option key={d.code} value={d.code}>
                    {diagnosisLabel(d, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 2, minWidth: 200 }}>
              <span className="field__label">{t('clinician.participant.diagnosisText')}</span>
              <input className="input" value={dxText} onChange={(e) => setDxText(e.target.value)} maxLength={200} />
            </label>
          </div>
        </>
      )}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>
          <span className="field__label">{t('clinician.participant.timepoint')}</span>
          <select className="select" value={timepoint} onChange={(e) => setTimepoint(e.target.value as Timepoint)}>
            {TIMEPOINTS.map((tp) => (
              <option key={tp} value={tp}>
                {t(`enum.timepoint.${tp}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>
          <span className="field__label">{t('clinician.participant.respondent')}</span>
          <select className="select" value={respondent} onChange={(e) => setRespondent(e.target.value as Respondent)}>
            {RESPONDENTS.map((r) => (
              <option key={r} value={r}>
                {t(`enum.respondent.${r}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field__label">{t('clinician.participant.focusNote')}</span>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('clinician.participant.focusNotePlaceholder')} rows={2} />
      </label>

      {map && (
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend className="field__label">
            {t('clinician.participant.focusConstructs')} <span className="muted small">({map.slug} v{map.version})</span>
          </legend>
          {map.map.domains.map((d) => (
            <div key={d.id} style={{ marginBottom: 8 }}>
              <div className="small muted" style={{ marginBottom: 4 }}>
                {d.label}
              </div>
              <div className="checkbox-grid">
                {d.constructs.map((c) => (
                  <label key={c.id} className="choice" title={c.description}>
                    <input type="checkbox" checked={focus.includes(c.id)} onChange={() => toggle(c.id)} />
                    <span>
                      {c.label}
                      {dxDefaults.includes(c.id) && <span className="muted small"> ★</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      )}

      <button type="submit" className="btn btn--primary" disabled={busy || (!participant && !displayName.trim())}>
        {busy ? t('clinician.participant.creating') : t('clinician.participant.create')}
      </button>
    </form>
  )
}
