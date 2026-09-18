import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { config } from '../config'
import { useT } from '../i18n'
import { tokenFromInput } from '../lib/links'
import { LanguageSwitch } from './ui'

export function Landing() {
  const { t } = useT()
  const navigate = useNavigate()
  const [showLink, setShowLink] = useState(false)
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const token = tokenFromInput(value)
    if (!token) {
      setInvalid(true)
      return
    }
    navigate(`/p/${token}`)
  }

  return (
    <main className="page page--center landing" id="main">
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <LanguageSwitch />
      </div>
      <h1>{t('landing.title')}</h1>
      <p className="muted">{t('landing.subtitle')}</p>
      <div className="landing__actions">
        {!showLink ? (
          <button type="button" className="btn btn--primary btn--lg" onClick={() => setShowLink(true)}>
            {t('landing.haveLink')}
          </button>
        ) : (
          <form onSubmit={submit} className="card stack" style={{ textAlign: 'start' }}>
            <label className="field">
              <span className="field__label">{t('landing.enterLink')}</span>
              <input
                className="input"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setInvalid(false)
                }}
                placeholder={t('landing.enterLinkPlaceholder')}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={invalid}
              />
              {invalid && <span className="field__help" style={{ color: 'var(--danger)' }}>{t('patient.invalidLink')}</span>}
            </label>
            <button type="submit" className="btn btn--primary btn--block">
              {t('landing.open')}
            </button>
          </form>
        )}
        <Link to="/clinician" className="btn btn--lg">
          {t('landing.clinicianSignIn')}
        </Link>
        {config.mock && (
          <Link to="/p/demo-es" className="small">
            {t('landing.demoLink')}
          </Link>
        )}
      </div>
    </main>
  )
}
