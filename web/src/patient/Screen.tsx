import { useMemo, useState } from 'react'
import { Steps } from '../components/ui'
import { useT } from '../i18n'
import type { Language, ScreenItem, ScreenState } from '../types'
import { itemText } from '../lib/screen'

interface Props {
  screen: ScreenState
  language: Language
  onSubmit: (scores: Record<string, number>) => void
  busy: boolean
}

const DOMAINS: ScreenItem['domain'][] = ['facial', 'social', 'function']
const SCALE = Array.from({ length: 11 }, (_, i) => i)


/** The numeric screen: ~20 rated items, grouped by domain, all required. */
export function Screen({ screen, language, onSubmit, busy }: Props) {
  const { t } = useT()
  const [scores, setScores] = useState<Record<string, number>>(() => screen.scores ?? {})
  const [showMissing, setShowMissing] = useState(false)
  const items = useMemo(() => [...screen.items].sort((a, b) => a.sort_order - b.sort_order), [screen.items])
  const answered = items.filter((i) => scores[i.id] !== undefined).length
  const complete = answered === items.length

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!complete) {
      setShowMissing(true)
      return
    }
    onSubmit(scores)
  }

  return (
    <main className="page" id="main">
      <Steps total={4} current={2} />
      <form onSubmit={submit} className="card screen">
        <h1>{t('patient.screen.title')}</h1>
        <p className="muted">{t('patient.screen.intro')}</p>
        <p className="screen__progress" aria-live="polite">
          {t('patient.screen.progress', { done: answered, total: items.length })}
        </p>
        {DOMAINS.map((domain) => {
          const group = items.filter((i) => i.domain === domain)
          if (!group.length) return null
          return (
            <section key={domain} className="screen__group">
              <h2>{t(`patient.screen.${domain}`)}</h2>
              {group.map((item) => {
                const { text, low, high } = itemText(item, language)
                const value = scores[item.id]
                const missing = showMissing && value === undefined
                return (
                  <fieldset key={item.id} className={`screen__item ${missing ? 'screen__item--missing' : ''}`}>
                    <legend>{text}</legend>
                    <div className="screen__scale" role="radiogroup" aria-label={text}>
                      {SCALE.map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={value === n}
                          className={`screen__btn ${value === n ? 'screen__btn--on' : ''}`}
                          onClick={() => setScores((s) => ({ ...s, [item.id]: n }))}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="screen__labels" aria-hidden="true">
                      <span>{low}</span>
                      <span>{high}</span>
                    </div>
                  </fieldset>
                )
              })}
            </section>
          )
        })}
        {showMissing && !complete && (
          <p className="alert alert--danger" role="alert">
            {t('patient.screen.missing')}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
          {t('patient.screen.submit')}
        </button>
      </form>
    </main>
  )
}
