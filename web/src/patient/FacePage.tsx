import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Steps } from '../components/ui'
import { DIAGNOSIS_CATALOG, diagnosisLabel } from '../data/diagnosisCatalog'
import { useT } from '../i18n'
import type { DiagnosisCatalogEntry, IntakeFields, SessionState } from '../types'
import { AGE_BANDS, READING_COMFORTS } from '../types'

interface Props {
  session: SessionState
  onSubmit: (fields: IntakeFields) => void
  busy: boolean
}

export function FacePage({ session, onSubmit, busy }: Props) {
  const { t, lang } = useT()
  const p = session.participant
  const [displayName, setDisplayName] = useState(p.display_name)
  const [ageBand, setAgeBand] = useState(p.age_band)
  const [reading, setReading] = useState(p.reading_comfort)
  const [dx, setDx] = useState(p.diagnosis_code)
  const [dxText, setDxText] = useState(p.diagnosis_text)
  const [catalog, setCatalog] = useState<DiagnosisCatalogEntry[]>(DIAGNOSIS_CATALOG)

  useEffect(() => {
    let alive = true
    api.diagnosisCatalog().then((c) => alive && c.length && setCatalog(c)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({
      display_name: displayName.trim() || p.display_name,
      preferred_language: lang,
      age_band: ageBand,
      reading_comfort: reading,
      diagnosis_code: dx,
      diagnosis_text: dxText.trim(),
    })
  }

  return (
    <main className="page" id="main">
      <Steps total={3} current={1} />
      <h1>{t('patient.face.title')}</h1>
      <p className="muted">{t('patient.face.intro')}</p>
      <form onSubmit={submit} className="card">
        <label className="field">
          <span className="field__label">{t('patient.face.displayName')}</span>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" maxLength={40} required />
          <span className="field__help">{t('patient.face.displayNameHelp')}</span>
        </label>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
          <legend className="field__label">{t('patient.face.ageBand')}</legend>
          <div className="choice-list">
            {AGE_BANDS.map((b) => (
              <label key={b} className="choice">
                <input type="radio" name="age_band" value={b} checked={ageBand === b} onChange={() => setAgeBand(b)} />
                {t(`enum.ageBand.${b}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
          <legend className="field__label">{t('patient.face.readingComfort')}</legend>
          <div className="choice-list">
            {READING_COMFORTS.map((r) => (
              <label key={r} className="choice">
                <input type="radio" name="reading_comfort" value={r} checked={reading === r} onChange={() => setReading(r)} />
                {t(`enum.readingComfort.${r}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field__label">{t('patient.face.diagnosis')}</span>
          <select className="select" value={dx} onChange={(e) => setDx(e.target.value)}>
            {catalog.map((d) => (
              <option key={d.code} value={d.code}>
                {diagnosisLabel(d, lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('patient.face.diagnosisText')}</span>
          <input className="input" value={dxText} onChange={(e) => setDxText(e.target.value)} placeholder={t('patient.face.diagnosisTextPlaceholder')} maxLength={200} />
        </label>

        <p className="small muted">
          {t('patient.face.respondent')}: {t(`enum.respondent.${session.respondent}`)} · {t('patient.face.timepoint')}: {t(`enum.timepoint.${session.timepoint}`)}
        </p>

        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
          {busy ? t('common.oneMoment') : t('patient.face.start')}
        </button>
      </form>
    </main>
  )
}
