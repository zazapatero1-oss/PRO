import { useT } from '../i18n'

export function ThankYou() {
  const { t } = useT()
  return (
    <main className="page page--center" id="main" style={{ textAlign: 'center' }}>
      <h1>{t('patient.thanks.title')}</h1>
      <p>{t('patient.thanks.body')}</p>
      <p className="muted">{t('patient.thanks.close')}</p>
    </main>
  )
}
