import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { config } from './config'
import { I18nProvider } from './i18n'
import './styles/global.css'

// BrowserRouter's basename must not have a trailing slash.
const basename = config.basePath.replace(/\/$/, '') || undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter basename={basename}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
)
