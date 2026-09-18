import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { ErrorBox, LanguageSwitch } from '../components/ui'
import { config } from '../config'
import { useT } from '../i18n'

export function SignIn() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.signInWithMagicLink(email.trim())
      setSent(true)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const demo = async () => {
    setBusy(true)
    try {
      await api.signInAsDemo()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page page--center" id="main">
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <LanguageSwitch />
      </div>
      <h1>{t('clinician.signIn.title')}</h1>
      {error ? <ErrorBox error={error} /> : null}
      {sent ? (
        <p className="alert" role="status">
          {t('clinician.signIn.sent')}
        </p>
      ) : (
        <form onSubmit={submit} className="card">
          <label className="field">
            <span className="field__label">{t('clinician.signIn.email')}</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
          </label>
          <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email}>
            {t('clinician.signIn.sendLink')}
          </button>
        </form>
      )}
      {config.mock && (
        <button type="button" className="btn btn--block" onClick={demo} disabled={busy}>
          {t('clinician.signIn.demo')}
        </button>
      )}
    </main>
  )
}
