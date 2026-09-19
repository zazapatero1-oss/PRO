import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { ErrorBox, Loading } from '../components/ui'
import { useT } from '../i18n'
import { diffConstructMaps, type MapDiffDetail } from '../lib/mapDiff'
import type { ConstructMapRow, IngestDiff, IngestResult, InstrumentRow } from '../types'
import { splitForIngestion } from '../lib/ingestion'

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
  const [diff, setDiff] = useState<IngestDiff | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

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
      // Long questionnaires are sent in chunks; each chunk extends the same draft.
      const chunks = splitForIngestion(text)
      let draftId: string | undefined
      let last: IngestResult | null = null
      const total: IngestDiff = { facets_added: 0, constructs_added: [], triage_added: 0 }
      for (let i = 0; i < chunks.length; i++) {
        setProgress({ done: i, total: chunks.length })
        last = await api.ingestInstrument({ instrument_slug: slug, text: chunks[i], population, base_map_id: draftId })
        draftId = last.construct_map.id
        total.facets_added += last.diff.facets_added
        total.constructs_added.push(...last.diff.constructs_added)
        total.triage_added += last.diff.triage_added
      }
      setProgress(null)
      if (last) {
        setProposed(last.construct_map)
        setDiff(total)
      }
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

  // The draft was merged into the highest approved version of the same map (v1.1 §E).
  const base =
    proposed && maps
      ? maps
          .filter((m) => m.slug === proposed.slug && m.status === 'approved' && m.version < proposed.version)
          .sort((a, b) => a.version - b.version)
          .slice(-1)[0] ?? null
      : null
  const detail: MapDiffDetail | null = proposed ? diffConstructMaps(base?.map ?? null, proposed.map) : null

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
          {busy === 'propose' ? `${t('clinician.instruments.proposing')}${progress ? ` ${progress.done + 1}/${progress.total}` : ''}` : t('clinician.instruments.propose')}
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
          {detail && (
            <IngestDiffView
              detail={detail}
              diff={diff}
              baseLabel={base ? `${base.slug} v${base.version}` : proposed.slug}
              baseVersion={base?.version ?? 0}
              version={proposed.version}
              slug={proposed.slug}
            />
          )}
          <details style={{ marginTop: 12 }}>
            <summary className="small">{t('clinician.instruments.showJson')}</summary>
            <pre className="json" style={{ marginTop: 12 }}>
              {JSON.stringify(proposed.map, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </main>
  )
}

/** Human-readable render of the ingestion merge diff (v1.1 §E/§F), shown before Approve. */
export function IngestDiffView({
  detail,
  diff,
  baseLabel,
  baseVersion,
  version,
  slug,
}: {
  detail: MapDiffDetail
  diff: IngestDiff | null
  baseLabel: string
  baseVersion: number
  version: number
  slug: string
}) {
  const { t } = useT()
  const totals = diff ?? {
    facets_added: detail.totals.facets_added,
    constructs_added: detail.constructs.map((c) => c.id),
    triage_added: detail.totals.triage_added,
  }
  return (
    <div style={{ marginTop: 12 }}>
      <h3>{t('clinician.instruments.diff.title')}</h3>
      <p className="small muted">
        {t('clinician.instruments.diff.summary', {
          slug,
          base: baseVersion,
          version,
          facets: totals.facets_added,
          constructs: totals.constructs_added.length,
          triage: totals.triage_added,
        })}
      </p>
      <p className="small muted">
        {t('clinician.instruments.diff.mergedInto')}: {baseLabel}
      </p>

      <div className="diff__group">
        <h4>{t('clinician.instruments.diff.facetsAdded')}</h4>
        {detail.facets.length === 0 ? (
          <p className="muted small">{t('clinician.instruments.diff.none')}</p>
        ) : (
          detail.facets.map((f) => (
            <div key={f.construct_id} className="diff__construct">
              <strong>{f.label}</strong>
              <div className="facets__group" style={{ marginTop: 4 }}>
                {f.facets.map((x) => (
                  <span key={x.id} className="chip chip--covered">
                    {x.label}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="diff__group">
        <h4>{t('clinician.instruments.diff.constructsAdded')}</h4>
        {detail.constructs.length === 0 ? (
          <p className="muted small">{t('clinician.instruments.diff.none')}</p>
        ) : (
          detail.constructs.map((c) => (
            <div key={c.id} className="diff__construct">
              <strong>{c.label}</strong> <span className="small muted">{c.id}</span>
              <p className="small" style={{ margin: '2px 0 0' }}>
                {c.description}
              </p>
              <div className="facets__group" style={{ marginTop: 4 }}>
                {c.facets.map((x) => (
                  <span key={x.id} className="chip chip--covered">
                    {x.label}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="diff__group">
        <h4>{t('clinician.instruments.diff.triageAdded')}</h4>
        {detail.triage.length === 0 ? (
          <p className="muted small">{t('clinician.instruments.diff.none')}</p>
        ) : (
          <ul>
            {detail.triage.map((x) => (
              <li key={x.id}>
                {x.intent} <span className="small muted">→ {x.maps_to.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
