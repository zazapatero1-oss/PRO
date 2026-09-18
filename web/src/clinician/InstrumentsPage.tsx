import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { ErrorBox, Loading } from '../components/ui'
import { useT } from '../i18n'
import type { ConstructMapRow, InstrumentRow } from '../types'

export function InstrumentsPage() {
  const { t } = useT()
  const [instruments, setInstruments] = useState<InstrumentRow[] | null>(null)
  const [maps, setMaps] = useState<ConstructMapRow[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  const [slug, setSlug] = useState('')
  const [population, setPopulation] = useState<'adult' | 'pediatric'>('adult')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'propose' | 'approve' | null>(null)
  const [proposed, setProposed] = useState<ConstructMapRow | null>(null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([api.listInstruments(), api.listConstructMaps()])
      .then(([i, m]) => {
        setInstruments(i)
        setMaps(m)
        setSlug((s) => s || i[0]?.slug || '')
      })
      .catch(setError)
  }, [])
  useEffect(load, [load])

  const propose = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('propose')
    setError(null)
    try {
      setProposed(await api.ingestInstrument({ instrument_slug: slug, text, population }))
      load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  const approve = async () => {
    if (!proposed) return
    setBusy('approve')
    try {
      setProposed(await api.approveConstructMap(proposed.id))
      load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  const count = (m: ConstructMapRow) => m.map.domains.reduce((n, d) => n + d.constructs.length, 0)

  return (
    <main className="page page--wide" id="main">
      <h1>{t('clinician.instruments.title')}</h1>
      {error ? <ErrorBox error={error} onRetry={load} /> : null}
      {!instruments && !error && <Loading />}

      {instruments && (
        <section className="card table-wrap">
          <h2>{t('clinician.instruments.list')}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>{t('clinician.instruments.slug')}</th>
                <th>{t('clinician.instruments.version')}</th>
                <th>{t('clinician.instruments.itemTextStored')}</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="small muted">
                      {i.slug} · {i.publisher}
                    </div>
                    <div className="small muted">{i.license_notes}</div>
                  </td>
                  <td>{i.version}</td>
                  <td>{i.item_text_stored ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {maps && (
        <section className="card table-wrap">
          <h2>{t('clinician.instruments.maps')}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>{t('clinician.instruments.slug')}</th>
                <th>{t('clinician.instruments.population')}</th>
                <th>{t('clinician.instruments.version')}</th>
                <th>{t('clinician.instruments.status')}</th>
              </tr>
            </thead>
            <tbody>
              {maps.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.slug}
                    <div className="small muted">{t('clinician.instruments.constructCount', { count: count(m) })}</div>
                  </td>
                  <td>{t(`enum.population.${m.population}`)}</td>
                  <td>{m.version}</td>
                  <td>
                    <span className="badge">{t(`enum.mapStatus.${m.status}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <form className="card" onSubmit={propose}>
        <h2>{t('clinician.instruments.ingest')}</h2>
        <p className="muted small">{t('clinician.instruments.ingestIntro')}</p>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            <span className="field__label">{t('clinician.instruments.slug')}</span>
            <select className="select" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {(instruments ?? []).map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <span className="field__label">{t('clinician.instruments.population')}</span>
            <select className="select" value={population} onChange={(e) => setPopulation(e.target.value as 'adult' | 'pediatric')}>
              <option value="adult">{t('enum.population.adult')}</option>
              <option value="pediatric">{t('enum.population.pediatric')}</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field__label">{t('clinician.instruments.text')}</span>
          <textarea className="textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} required />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy !== null || !text.trim() || !slug}>
          {busy === 'propose' ? t('clinician.instruments.proposing') : t('clinician.instruments.propose')}
        </button>
      </form>

      {proposed && (
        <section className="card" aria-live="polite">
          <div className="row row--between">
            <h2 style={{ margin: 0 }}>
              {t('clinician.instruments.proposed')} <span className="badge">{t(`enum.mapStatus.${proposed.status}`)}</span>
            </h2>
            {proposed.status === 'draft' ? (
              <button type="button" className="btn btn--primary btn--sm" onClick={approve} disabled={busy !== null}>
                {busy === 'approve' ? t('clinician.instruments.approving') : t('clinician.instruments.approve')}
              </button>
            ) : (
              <span className="badge">{t('clinician.instruments.approved')}</span>
            )}
          </div>
          <pre className="json" style={{ marginTop: 12 }}>
            {JSON.stringify(proposed.map, null, 2)}
          </pre>
        </section>
      )}
    </main>
  )
}
