import { useT } from '../i18n'
import type { Language } from '../types'
import { LANGUAGES } from '../types'

const NATIVE: Record<Language, string> = { en: 'English', es: 'Español' }
const PROMPT: Record<Language, string> = { en: 'Continue in English', es: 'Continuar en español' }

export function LanguagePicker({ onPick, busy }: { onPick: (l: Language) => void; busy: boolean }) {
  const { t } = useT()
  return (
    <main className="page page--center" id="main">
      {/* Both languages are shown natively so the prompt is readable before a choice is made. */}
      <h1 lang="en">Which language would you like to use?</h1>
      <p className="muted" lang="es">
        ¿Qué idioma prefiere usar?
      </p>
      <div className="lang-grid">
        {LANGUAGES.map((l) => (
          <button key={l} type="button" lang={l} className="btn btn--lg btn--primary" disabled={busy} onClick={() => onPick(l)}>
            <span>
              {NATIVE[l]}
              <br />
              <span className="small" style={{ fontWeight: 400 }}>
                {PROMPT[l]}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>
        {t('patient.language.hint')}
      </p>
    </main>
  )
}
