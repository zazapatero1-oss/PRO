import { Link } from 'react-router-dom'
import { useT } from '../i18n'

export function NotFound() {
  const { t } = useT()
  return (
    <main className="page page--center">
      <h1>{t('common.notFound')}</h1>
      <Link to="/" className="btn">
        {t('common.home')}
      </Link>
    </main>
  )
}
