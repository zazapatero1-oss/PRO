import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ErrorBox, Loading } from '../components/ui'
import { config } from '../config'
import { DIAGNOSIS_CATALOG, diagnosisLabel } from '../data/diagnosisCatalog'
import { useT } from '../i18n'
import type { ParticipantListItem } from '../types'

export function ParticipantsList() {
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<ParticipantListItem[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setError(null)
    api.listParticipants().then(setItems).catch(setError)
  }, [])
  useEffect(load, [load])

  const reset = () => {
    const a = api as unknown as { reset?: () => void }
    a.reset?.()
    load()
  }

  return (
    <main className="page page--wide" id="main">
      <div className="row row--between">
        <h1>{t('clinician.participants.title')}</h1>
        <div className="row">
          {config.mock && (
            <button type="button" className="btn btn--sm" onClick={reset}>
              {t('clinician.participants.resetDemo')}
            </button>
          )}
          <Link to="/clinician/participant/new" className="btn btn--primary btn--sm">
            {t('clinician.participants.newParticipant')}
          </Link>
        </div>
      </div>
      {error ? <ErrorBox error={error} onRetry={load} /> : null}
      {!items && !error && <Loading />}
      {items && items.length === 0 && <p className="muted">{t('clinician.participants.empty')}</p>}
      {items && items.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('clinician.participants.studyId')}</th>
                <th>{t('clinician.participants.diagnosis')}</th>
                <th>{t('clinician.participants.timepoints')}</th>
                <th>{t('clinician.participants.lastStatus')}</th>
                <th>{t('clinician.participants.flags')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ participant: p, timepoints_completed, last_session_status, flag_count }) => {
                const dx = DIAGNOSIS_CATALOG.find((d) => d.code === p.diagnosis_code)
                return (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/clinician/participant/${p.id}`)}>
                    <td>
                      <Link to={`/clinician/participant/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        {p.study_id}
                      </Link>
                      {p.is_demo && <span className="badge" style={{ marginInlineStart: 6 }}>{t('clinician.participants.demo')}</span>}
                      <div className="small muted">
                        {p.display_name} · {t(`enum.language.${p.preferred_language}`)} · {t(`enum.ageBand.${p.age_band}`)}
                      </div>
                    </td>
                    <td>{diagnosisLabel(dx, lang) || p.diagnosis_code}</td>
                    <td>
                      {timepoints_completed.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        timepoints_completed.map((tp) => (
                          <span key={tp} className="badge" style={{ marginInlineEnd: 4 }}>
                            {t(`enum.timepoint.${tp}`)}
                          </span>
                        ))
                      )}
                    </td>
                    <td>{last_session_status ? t(`enum.status.${last_session_status}`) : '—'}</td>
                    <td>
                      {flag_count > 0 ? (
                        <span className="badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                          {flag_count}
                        </span>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
