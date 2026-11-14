import { useT } from '../i18n'
import { facetsOf } from '../lib/constructMap'
import { itemText } from '../lib/screen'
import { SCREEN_LOW, isScreenQuote, severityForScore } from '../lib/screenScores'
import { severityVar } from '../lib/severity'
import type { ConstructMap, ProfileConstruct, ScreenItem, Timepoint } from '../types'

interface Props {
  items: ScreenItem[]
  scores: Record<string, number>
  /** Ratings from the participant's previous completed visit, when there is one. */
  prior: { timepoint: Timepoint; scores: Record<string, number> } | null
  /** Profile constructs, for what the patient said about each rated area. */
  constructs: ProfileConstruct[]
  /** Construct ids the conversation went into (session focus). */
  focus: string[]
  map: ConstructMap | null
}

const DOMAINS: ScreenItem['domain'][] = ['facial', 'social', 'function']
const MAX_QUOTES = 3

function constructLabel(map: ConstructMap | null, id: string): string | null {
  for (const d of map?.domains ?? []) for (const c of d.constructs) if (c.id === id) return c.label
  return null
}

function Delta({ now, before, timepoint }: { now: number; before: number | undefined; timepoint: string }) {
  const { t } = useT()
  if (before === undefined) return null
  const diff = now - before
  const cls = diff > 0 ? 'delta delta--up' : diff < 0 ? 'delta delta--down' : 'delta'
  const text = diff > 0 ? `▲ +${diff}` : diff < 0 ? `▼ −${Math.abs(diff)}` : '='
  return (
    <span className={cls} title={t('clinician.session.wasAt', { score: before, timepoint })}>
      {text}
    </span>
  )
}

function Bar({ score }: { score: number }) {
  return (
    <span className="scorebar" aria-hidden="true">
      <span className="scorebar__fill" style={{ width: `${score * 10}%`, background: severityVar(severityForScore(score)) }} />
    </span>
  )
}

/**
 * The first thing a clinician reads: the patient's own ratings, lowest first, each low one with
 * what they said about it and how it moved since the last visit. Everything else is detail.
 */
export function AtAGlance({ items, scores, prior, constructs, focus, map }: Props) {
  const { t, lang } = useT()
  const priorLabel = prior ? t(`enum.timepoint.${prior.timepoint}`) : ''
  const rows = items
    .filter((i) => typeof scores[i.id] === 'number')
    .map((i) => ({ item: i, score: scores[i.id], construct: constructs.find((c) => c.id === i.construct_id) ?? null }))
    .sort((a, b) => a.score - b.score || a.item.sort_order - b.item.sort_order)
  if (rows.length === 0) return null

  const isLow = (r: (typeof rows)[number]) => r.score <= SCREEN_LOW || focus.includes(r.item.construct_id)
  const low = rows.filter(isLow)
  const rest = rows.filter((r) => !isLow(r))
  const said = (c: ProfileConstruct | null) => (c?.quotes ?? []).filter((q) => !isScreenQuote(q.text))
  const discussed = low.filter((r) => said(r.construct).length > 0).length
  const confirmed = low.filter((r) => r.construct?.confirmed === true).length

  const mean = (pool: typeof rows, src: Record<string, number>) => {
    const vals = pool.map((r) => src[r.item.id]).filter((v): v is number => typeof v === 'number')
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  return (
    <section className="card glance">
      <h2>{t('clinician.session.atAGlance')}</h2>
      <p className="muted small">
        {t('clinician.session.atAGlanceIntro')}
        {prior ? ` ${t('clinician.session.comparedWith', { timepoint: priorLabel })}` : ''}
      </p>

      <div className="glance__tiles">
        {DOMAINS.map((d) => {
          const pool = rows.filter((r) => r.item.domain === d)
          const now = mean(pool, scores)
          if (now === null) return null
          const before = prior ? mean(pool, prior.scores) : null
          const diff = before === null ? null : Math.round((now - before) * 10) / 10
          return (
            <div key={d} className="glance__tile" style={{ borderInlineStartColor: severityVar(severityForScore(Math.round(now))) }}>
              <div className="small muted">{t(`clinician.session.screenDomain.${d}`)}</div>
              <div className="glance__tile-value">
                {now.toFixed(1)}
                <span className="small muted"> /10</span>
                {diff !== null && diff !== 0 && (
                  <span className={`delta ${diff > 0 ? 'delta--up' : 'delta--down'}`} title={t('clinician.session.wasAt', { score: before!.toFixed(1), timepoint: priorLabel })}>
                    {diff > 0 ? `▲ +${diff.toFixed(1)}` : `▼ −${Math.abs(diff).toFixed(1)}`}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="small glance__summary">
        {t('clinician.session.glanceSummary', { low: rows.filter((r) => r.score <= SCREEN_LOW).length, total: rows.length, threshold: SCREEN_LOW, discussed, confirmed })}
      </p>

      <ol className="glance__list">
        {low.map(({ item, score, construct }) => {
          const quotes = said(construct)
          const total = facetsOf(map, item.construct_id).length
          const covered = construct?.facets_covered?.length ?? 0
          return (
            <li key={item.id} className="glance__row">
              <div className="glance__head" title={itemText(item, lang).text}>
                <span className="glance__label">{constructLabel(map, item.construct_id) ?? itemText(item, lang).text}</span>
                <Bar score={score} />
                <span className="glance__score">
                  {score}
                  <span className="small muted">/10</span>
                </span>
                <Delta now={score} before={prior?.scores[item.id]} timepoint={priorLabel} />
              </div>
              <div className="glance__meta">
                {construct?.confirmed === true && <span className="badge badge--ok">✓ {t('clinician.session.confirmedWithPatient')}</span>}
                {quotes.length > 0 && construct?.confirmed === false && <span className="badge badge--open">{t('clinician.session.notConfirmed')}</span>}
                {total > 0 && covered > 0 && <span className="small muted">{t('clinician.session.detailsCovered', { n: covered, total })}</span>}
              </div>
              {quotes.length === 0 ? (
                <p className="small muted glance__none">{t('clinician.session.notDiscussed')}</p>
              ) : (
                <ul className="glance__quotes">
                  {quotes.slice(0, MAX_QUOTES).map((q, i) => (
                    <li key={i}>
                      “{q.text}”{q.gloss_en && q.gloss_en !== q.text && <span className="small muted"> — {q.gloss_en}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      {rest.length > 0 && (
        <>
          <h3 className="glance__rest-title">{t('clinician.session.ratedHigher', { n: SCREEN_LOW + 1 })}</h3>
          <ul className="glance__rest">
            {rest.map(({ item, score }) => (
              <li key={item.id} title={itemText(item, lang).text}>
                <span className="glance__label">{constructLabel(map, item.construct_id) ?? itemText(item, lang).text}</span>
                <Bar score={score} />
                <span className="glance__score">{score}</span>
                <Delta now={score} before={prior?.scores[item.id]} timepoint={priorLabel} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
