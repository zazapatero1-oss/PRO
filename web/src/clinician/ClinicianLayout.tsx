import { Link, NavLink, Outlet } from 'react-router-dom'
import { LanguageSwitch, Loading } from '../components/ui'
import { useT } from '../i18n'
import { SignIn } from './SignIn'
import { AuthProvider, useAuth } from './useAuth'

export function ClinicianLayout() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}

function Shell() {
  const { t } = useT()
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return (
      <main className="page page--center">
        <Loading />
      </main>
    )
  }
  if (!user) return <SignIn />

  return (
    <>
      <a href="#main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      <header className="topbar no-print">
        <Link to="/clinician" className="topbar__brand">
          {t('common.appName')}
        </Link>
        <nav className="topbar__nav" aria-label="Clinician">
          <NavLink to="/clinician" end>
            {t('clinician.nav.participants')}
          </NavLink>
          <NavLink to="/clinician/instruments">{t('clinician.nav.instruments')}</NavLink>
          <LanguageSwitch />
          <button type="button" className="btn btn--sm" onClick={() => void signOut()}>
            {t('common.signOut')}
          </button>
        </nav>
      </header>
      <Outlet />
    </>
  )
}
