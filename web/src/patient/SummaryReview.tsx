import { useReducer, useState, type FormEvent } from 'react'
import { Steps } from '../components/ui'
import { useT } from '../i18n'
import type { PatientCorrection } from '../types'
import { correctionsReducer, finalCorrections, initialCorrections } from './correctionsReducer'

interface Props {
  summary: string
  onConfirm: (corrections: PatientCorrection[]) => Promise<void>
}

export function SummaryReview({ summary, onConfirm }: Props) {
  const { t } = useT()
  const [state, dispatch] = useReducer(correctionsReducer, initialCorrections)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = (e: FormEvent) => {
    e.preventDefault()
    dispatch({ type: 'add' })
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm(finalCorrections(state))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const hasCorrections = finalCorrections(state).length > 0

  return (
    <main className="page" id="main">
      <Steps total={4} current={3} />
      <h1>{t('patient.summary.title')}</h1>
      <p className="muted">{t('patient.summary.intro')}</p>
      <div className="card">
        <p className="summary-text">{summary}</p>
      </div>

      <form className="card" onSubmit={add}>
        <label className="field">
          <span className="field__label">{t('patient.summary.correctLabel')}</span>
          <textarea
            className="textarea"
            value={state.draft}
            onChange={(e) => dispatch({ type: 'draft', value: e.target.value })}
            placeholder={t('patient.summary.correctPlaceholder')}
            rows={3}
          />
        </label>
        <button type="submit" className="btn" disabled={!state.draft.trim() || busy}>
          {t('patient.summary.add')}
        </button>
        {state.items.length > 0 && (
          <>
            <h2 style={{ marginTop: 16 }}>{t('patient.summary.yourCorrections')}</h2>
            <ul className="corrections">
              {state.items.map((c, i) => (
                <li key={i}>
                  <p>{c.patient_text}</p>
                  <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'remove', index: i })} aria-label={`${t('patient.summary.remove')}: ${c.patient_text}`}>
                    {t('patient.summary.remove')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </form>

      {error && (
        <div className="alert alert--danger" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={confirm}>
        {busy ? t('patient.summary.confirming') : hasCorrections ? t('patient.summary.confirmWithCorrections') : t('patient.summary.confirm')}
      </button>
    </main>
  )
}
