import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { ConfirmDialog, ErrorBox, Loading, SeverityBadge, SeverityDot, Tooltip } from '../components/ui'
import { DIAGNOSIS_CATALOG, diagnosisLabel } from '../data/diagnosisCatalog'
import { useT } from '../i18n'
import { downloadBlob } from '../lib/download'
import { facetLabel, triageItem, triageOrder } from '../lib/constructMap'
import { aggregateDomainSeverity, severityVar } from '../lib/severity'
import type { ConstructEvidenceRow, ConstructMap, FindingCategory, ProfileConstruct, SessionDetail, Severity } from '../types'

const CATEGORIES: FindingCategory[] = ['onset', 'trajectory', 'triggers', 'relief', 'impact', 'expectation', 'patient_question', 'other']

function labelFor(map: ConstructMap | null, id: string): string {
  if (!map) return id
  for (const d of map.domains) for (const c of d.constructs) if (c.id === id) return c.label
  return id
}

export function SessionReview() {
  const { id = '' } = useParams()
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api.sessionDetail(id).then(setDetail).catch(setError)
  }, [id])
  useEffect(load, [load])

  const map = detail?.construct_map?.map ?? null
  const label = useCallback((cid: string) => labelFor(map, cid), [map])

  const exportAs = async (format: 'fhir' | 'csv') => {
    if (!detail) return
    setBusy(format)
    try {
      const blob = await api.exportSession(detail.session.id, format)
      downloadBlob(blob, `${detail.participant.study_id}-${detail.session.timepoint}.${format === 'fhir' ? 'fhir.json' : 'csv'}`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const reopen = async () => {
    if (!detail) return
    setBusy('reopen')
    try {
      await api.reopenSession(detail.session.id)
      setNotice(t('clinician.session.reopened'))
      load()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const doDelete = async () => {
    if (!detail) return
    setBusy('delete')
    try {
      await api.deleteParticipant(detail.participant.id)
      navigate('/clinician', { replace: true })
    } catch (e) {
      setError(e)
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  // v1.1 §A/§B: evidence rows carrying a triage_item are answers to the opening screen.
  const firstImpressions = useMemo(() => {
    if (!detail) return []
    return detail.evidence
      .filter((e) => e.triage_item !== null && !e.superseded_by)
      .sort((a, b) => triageOrder(map, a.triage_item ?? '') - triageOrder(map, b.triage_item ?? ''))
  }, [detail, map])

  const findingsByCategory = useMemo(() => {
    if (!detail) return []
    const source = detail.profile
      ? detail.profile.profile.domains.flatMap((d) => d.constructs.flatMap((c) => c.findings.map((f) => ({ ...f, construct_id: c.id }))))
      : detail.findings.map((f) => ({ category: f.category, text: f.finding, construct_id: f.construct_id }))
    return CATEGORIES.map((cat) => ({ cat, items: source.filter((f) => f.category === cat) })).filter((g) => g.items.length > 0)
  }, [detail])

  if (error && !detail) {
    return (
      <main className="page page--wide" id="main">
        <ErrorBox error={error} onRetry={load} />
      </main>
    )
  }
  if (!detail) {
    return (
      <main className="page page--wide" id="main">
        <Loading />
      </main>
    )
  }

  const { session: s, participant: p, profile } = detail
  const prof = profile?.profile ?? null
  const dx = DIAGNOSIS_CATALOG.find((d) => d.code === p.diagnosis_code)
  const openFlags = detail.safety_flags.filter((f) => !f.reviewed_at)

  return (
    <main className="page page--wide" id="main">
      <header className="print-only print-header">
        <div className="print-header__disclaimer">{t('common.disclaimer')}</div>
        <div>
          {p.study_id} · {t(`enum.timepoint.${s.timepoint}`)} · {new Date(s.created_at).toLocaleDateString()} · {t('common.appName')}
        </div>
      </header>

      <p className="small no-print">
        <Link to={`/clinician/participant/${p.id}`}>← {p.study_id}</Link>
      </p>
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>
            {t('clinician.session.title')}: {p.study_id} · {t(`enum.timepoint.${s.timepoint}`)}
          </h1>
          <p className="muted small">
            {p.display_name} · {diagnosisLabel(dx, lang) || p.diagnosis_code} · {t(`enum.respondent.${s.respondent}`)} · {t(`enum.language.${s.language}`)} ·{' '}
            {t(`enum.ageBand.${p.age_band}`)} · <span className="badge">{t(`enum.status.${s.status}`)}</span>
          </p>
        </div>
        <div className="row no-print">
          <button type="button" className="btn btn--sm" onClick={() => exportAs('fhir')} disabled={busy !== null}>
            {t('clinician.session.exportFhir')}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => exportAs('csv')} disabled={busy !== null}>
            {t('clinician.session.exportCsv')}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => window.print()}>
            {t('clinician.session.print')}
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            {t('clinician.session.deleteParticipant')}
          </button>
        </div>
      </div>

      <p className="alert alert--warn" role="note">
        {t('common.disclaimer')}
      </p>
      {error ? <ErrorBox error={error} /> : null}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}

      {detail.clinician_notes.length > 0 && (
        <section className="card">
          <h2>{t('clinician.session.focusNote')}</h2>
          {detail.clinician_notes.map((n) => (
            <div key={n.id}>
              {n.note && <p>{n.note}</p>}
              {n.focus_constructs.length > 0 && (
                <div className="row">
                  {n.focus_constructs.map((c) => (
                    <span key={c} className="badge">
                      {label(c)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {detail.safety_flags.length > 0 && (
        <section className="card" style={{ borderColor: 'var(--danger)' }}>
          <h2>{t('clinician.session.safetyFlags')}</h2>
          <ul>
            {detail.safety_flags.map((f) => (
              <li key={f.id}>
                <strong>{t(`enum.trigger.${f.trigger}`)}</strong> · {f.detected_by} · {new Date(f.created_at).toLocaleString()} · {f.action_taken}
                {f.reviewed_at && <span className="badge" style={{ marginInlineStart: 6 }}>{t('clinician.session.reviewed')}</span>}
              </li>
            ))}
          </ul>
          {(s.status === 'safety-halted' || openFlags.length > 0) && (
            <button type="button" className="btn btn--primary no-print" onClick={reopen} disabled={busy !== null}>
              {busy === 'reopen' ? t('clinician.session.reopening') : t('clinician.session.reopen')}
            </button>
          )}
        </section>
      )}

      {firstImpressions.length > 0 && (
        <section className="card">
          <h2>{t('clinician.session.firstImpressions')}</h2>
          <p className="muted small">{t('clinician.session.firstImpressionsIntro')}</p>
          <FirstImpressions rows={firstImpressions} map={map} label={label} />
        </section>
      )}

      {prof ? (
        <>
          <section className="card">
            <div className="row">
              <h2 style={{ margin: 0 }}>{t('clinician.session.domains')}</h2>
              <Tooltip label={t('clinician.session.domains')} text={t('clinician.session.aggregationTooltip')} />
            </div>
            <div className="tiles" style={{ marginTop: 12 }}>
              {prof.domains.map((d) => {
                const agg = aggregateDomainSeverity(d.constructs.map((c) => c.severity))
                return (
                  <div key={d.id} className={`tile tile--${d.severity}`} style={{ background: severityVar(d.severity) }} title={d.summary_en}>
                    <div className="tile__label">{d.label}</div>
                    <div>
                      <div className="tile__sev">{t(`enum.severity.${d.severity}`)}</div>
                      <div className="tile__conf">
                        {d.confidence > 0 ? `${t('clinician.session.confidence')} ${Math.round(d.confidence * 100)}%` : ''}
                        {agg.worst && agg.worst !== d.severity ? ` · ${t('clinician.session.worst')}: ${t(`enum.severity.${agg.worst}`)}` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {prof.change_from_prior.length > 0 && (
            <section className="card">
              <h2>{t('clinician.session.change')}</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('clinician.session.constructs')}</th>
                      <th>{t('clinician.session.prior')}</th>
                      <th>{t('clinician.session.now')}</th>
                      <th>{t('clinician.session.note')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prof.change_from_prior.map((c) => (
                      <tr key={c.construct_id}>
                        <td>{label(c.construct_id)}</td>
                        <td>
                          <SeverityBadge severity={c.prior} />
                        </td>
                        <td>
                          <SeverityBadge severity={c.now} />
                        </td>
                        <td>{c.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card">
            <h2>{t('clinician.session.constructs')}</h2>
            {prof.domains.map((d) => (
              <div key={d.id}>
                <h3 style={{ marginTop: 12 }}>
                  <SeverityDot severity={d.severity} />
                  {d.label}
                </h3>
                {d.summary_en && <p className="small muted">{d.summary_en}</p>}
                {d.constructs.map((c) => (
                  <ConstructRow key={c.id} c={c} label={label(c.id)} map={map} />
                ))}
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="card">
          <h2>{t('clinician.session.inferredProfile')}</h2>
          <p className="muted">{t('clinician.session.noProfile')}</p>
          {detail.evidence.length > 0 && (
            <>
              <h3>{t('clinician.session.evidenceOnly')}</h3>
              {detail.evidence
                .filter((e) => !e.superseded_by)
                .map((e) => (
                  <div key={e.id} className="construct">
                    <div className="construct__head">
                      <strong>{label(e.construct_id)}</strong>
                      <SeverityBadge severity={e.severity} />
                      <span className="small muted">
                        {t('clinician.session.confidence')} {Math.round(e.confidence * 100)}%
                      </span>
                    </div>
                    <Quote text={e.patient_quote} gloss={e.quote_gloss_en} />
                  </div>
                ))}
            </>
          )}
        </section>
      )}

      {findingsByCategory.length > 0 && (
        <section className="card">
          <h2>{t('clinician.session.findings')}</h2>
          {findingsByCategory.map((g) => (
            <div key={g.cat}>
              <h3>{t(`enum.category.${g.cat}`)}</h3>
              <ul className="findings">
                {g.items.map((f, i) => (
                  <li key={i}>
                    <span className="muted small">{label(f.construct_id)}: </span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {prof && (
        <section className="card">
          <ListBlock
            title={t('clinician.session.needsClarification')}
            items={[
              ...prof.needs_clarification.map((n) => `${label(n.construct_id)} — ${n.reason}`),
              // A focus construct that was explored but never reflected back and confirmed
              // still needs the clinician's attention (v1.1 §B).
              ...prof.domains
                .flatMap((d) => d.constructs)
                .filter((c) => c.confirmed === false && c.status !== 'declined')
                .filter((c) => !prof.needs_clarification.some((n) => n.construct_id === c.id))
                .map((c) => `${label(c.id)} — ${t('clinician.session.unconfirmedReason')}`),
            ]}
          />
          <ListBlock title={t('clinician.session.notCovered')} items={prof.not_covered.map(label)} />
          <ListBlock title={t('clinician.session.declined')} items={prof.declined.map(label)} />
          <ListBlock title={t('clinician.session.patientQuestions')} items={prof.patient_questions} />
        </section>
      )}

      {profile && (
        <section className="card">
          <h2>{t('clinician.session.patientSummary')}</h2>
          <p className="summary-text small">{profile.patient_summary}</p>
          {profile.patient_summary_confirmed_at && (
            <p className="small muted">
              {t('clinician.session.patientConfirmed')}: {new Date(profile.patient_summary_confirmed_at).toLocaleString()}
            </p>
          )}
          {profile.patient_corrections && profile.patient_corrections.length > 0 && (
            <>
              <h3>{t('clinician.session.corrections')}</h3>
              <ul>
                {profile.patient_corrections.map((c, i) => (
                  <li key={i}>
                    {c.construct_id && <span className="muted small">{label(c.construct_id)}: </span>}
                    {c.patient_text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <details>
          <summary>
            {t('clinician.session.transcript')} ({detail.messages.length})
          </summary>
          <div className="transcript" style={{ marginTop: 8 }}>
            {detail.messages.map((m) => (
              <div key={m.id} className={`transcript__msg ${m.role === 'patient' ? 'transcript__msg--patient' : ''}`}>
                <div className="transcript__meta">
                  #{m.seq} · {m.role}
                  {m.input_mode ? ` · ${m.input_mode}` : ''}
                  {m.tokens_in !== null ? ` · ${m.tokens_in}/${m.tokens_out} ${t('clinician.session.tokens')}` : ''}
                </div>
                {m.content}
              </div>
            ))}
          </div>
        </details>
      </section>

      <p className="small muted">
        {t('clinician.session.usage')}: {s.input_tokens + s.output_tokens} {t('clinician.session.tokens')}
        {s.cost_usd_estimate !== null ? ` · ~$${s.cost_usd_estimate.toFixed(2)}` : ''} · {t('clinician.session.generatedWith')}: {s.model_id} · {s.prompt_version}
        {prof ? ` · ${prof.generated_with.map}` : ''}
      </p>

      <ConfirmDialog
        open={confirmDelete}
        title={t('clinician.session.deleteTitle')}
        body={
          <p>
            {t('clinician.session.deleteBody')} <strong>{p.study_id}</strong>
          </p>
        }
        confirmLabel={busy === 'delete' ? t('clinician.session.deleting') : t('clinician.session.deleteParticipant')}
        cancelLabel={t('common.cancel')}
        danger
        busy={busy === 'delete'}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  )
}

export function FirstImpressions({
  rows,
  map,
  label,
}: {
  rows: ConstructEvidenceRow[]
  map: ConstructMap | null
  label: (id: string) => string
}) {
  return (
    <ul className="triage">
      {rows.map((e) => (
        <li key={e.id} className="triage__item">
          <div className="triage__intent">{triageItem(map, e.triage_item ?? '')?.intent ?? e.triage_item}</div>
          <Quote text={e.patient_quote} gloss={e.quote_gloss_en} />
          <div className="small muted">
            {label(e.construct_id)}
            {e.facets.length > 0 ? ` · ${e.facets.map((f) => facetLabel(map, e.construct_id, f)).join(', ')}` : ''}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Quote({ text, gloss }: { text: string; gloss: string }) {
  const { t } = useT()
  return (
    <blockquote className="quote">
      <div className="quote__text">“{text}”</div>
      {gloss && gloss !== text && (
        <div className="quote__gloss">
          {t('clinician.session.gloss')}: {gloss}
        </div>
      )}
    </blockquote>
  )
}

function ConstructRow({ c, label, map }: { c: ProfileConstruct; label: string; map: ConstructMap | null }) {
  const { t } = useT()
  const covered = c.facets_covered ?? []
  const missing = c.facets_missing ?? []
  return (
    <div className="construct">
      <div className="construct__head">
        <strong>{label}</strong>
        <SeverityBadge severity={c.severity as Severity} />
        {c.confirmed === true && <span className="badge badge--ok">✓ {t('clinician.session.confirmedWithPatient')}</span>}
        {c.confirmed === false && <span className="badge badge--open">{t('clinician.session.notConfirmed')}</span>}
        <span className="small muted">
          {t('clinician.session.confidence')} {Math.round(c.confidence * 100)}% · {t(`enum.constructStatus.${c.status}`)}
        </span>
      </div>
      {(covered.length > 0 || missing.length > 0) && (
        <div className="facets">
          {covered.length > 0 && (
            <div className="facets__group">
              <span className="facets__label">{t('clinician.session.facetsCovered')}</span>
              {covered.map((fid) => (
                <span key={fid} className="chip chip--covered">
                  {facetLabel(map, c.id, fid)}
                </span>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <div className="facets__group">
              <span className="facets__label">{t('clinician.session.facetsMissing')}</span>
              {missing.map((fid) => (
                <span key={fid} className="chip chip--missing">
                  {facetLabel(map, c.id, fid)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {c.quotes.map((q, i) => (
        <Quote key={i} text={q.text} gloss={q.gloss_en} />
      ))}
      {c.findings.length > 0 && (
        <ul className="findings">
          {c.findings.map((f, i) => (
            <li key={i}>
              <span className="muted small">{t(`enum.category.${f.category}`)}: </span>
              {f.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  const { t } = useT()
  return (
    <div style={{ marginBottom: 12 }}>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted small">{t('clinician.session.empty')}</p>
      ) : (
        <ul>
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
