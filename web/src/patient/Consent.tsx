import { useState } from 'react'
import { useT } from '../i18n'
import type { ConsentVariant } from '../types'
import { LanguageSwitch, Steps } from '../components/ui'

export function Consent({ variant, onAgree, busy }: { variant: ConsentVariant; onAgree: () => void; busy: boolean }) {
  const { t, tl } = useT()
  const [declined, setDeclined] = useState(false)
  const base = `patient.consent.${variant}`

  if (declined) {
    return (
      <main className="page page--center" id="main">
        <p role="status">{t('patient.consent.declined')}</p>
      </main>
    )
  }

  return (
    <main className="page" id="main">
      <div className="row row--between">
        <Steps total={4} current={0} />
        <LanguageSwitch />
      </div>
      <h1>{t(`${base}.title`)}</h1>
      <div className="card">
        {tl(`${base}.body`).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="stack">
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={onAgree}>
          {t(`${base}.agree`)}
        </button>
        <button type="button" className="btn btn--block" disabled={busy} onClick={() => setDeclined(true)}>
          {t(`${base}.decline`)}
        </button>
      </div>
    </main>
  )
}
