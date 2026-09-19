import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { ErrorBox, Loading } from '../components/ui'
import { useT } from '../i18n'
import type { IntakeFields, Language, PatientCorrection, SessionState } from '../types'
import { Chat } from './Chat'
import { Consent } from './Consent'
import { FacePage } from './FacePage'
import { Screen } from './Screen'
import { LanguagePicker } from './LanguagePicker'
import { SummaryReview } from './SummaryReview'
import { ThankYou } from './ThankYou'

type Step = 'language' | 'consent' | 'face' | 'screen' | 'chat' | 'generating' | 'summary' | 'done'

/**
 * `/p/:token`. The server's session status is the source of truth; the local `step` only
 * sequences the screens inside a status (language → consent inside `intake`, face → chat
 * inside `consented`). Reloading resumes from the status via session-state.
 */
export function PatientFlow() {
  const { token = '' } = useParams()
  const { t, lang, setLang } = useT()
  const [session, setSession] = useState<SessionState | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<Step>('language')
  const [summary, setSummary] = useState<string | null>(null)
  const langApplied = useRef(false)

  const onEnded = useCallback(async () => {
    setStep('generating')
    try {
      const r = await api.endSession(token)
      setSummary(r.patient_summary)
      setStep('summary')
    } catch (e) {
      setError(e)
    }
  }, [token])

  const load = useCallback(async () => {
    setError(null)
    try {
      const s = await api.sessionState(token)
      setSession(s)
      if (!langApplied.current && s.status !== 'intake') {
        langApplied.current = true
        setLang(s.language)
      }
      setStep(initialStep(s))
      if (s.patient_summary) setSummary(s.patient_summary)
      // A reload mid-wrap-up: the ended event was consumed but end-session never ran.
      if (s.status === 'wrapping-up') void onEnded()
    } catch (e) {
      setError(e)
    }
  }, [token, setLang, onEnded])

  useEffect(() => {
    void load()
  }, [load])

  const pickLanguage = async (l: Language) => {
    setLang(l)
    setBusy(true)
    try {
      setSession(await api.updateIntake(token, { preferred_language: l }))
      setStep('consent')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const agree = async () => {
    if (!session) return
    setBusy(true)
    try {
      setSession(await api.consent(token, session.consent_variant_needed))
      setStep('face')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const submitIntake = async (fields: IntakeFields) => {
    setBusy(true)
    try {
      const s = await api.updateIntake(token, fields)
      setSession(s)
      setStep(needsScreen(s) ? 'screen' : 'chat')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const submitScreen = async (scores: Record<string, number>) => {
    setBusy(true)
    try {
      setSession(await api.submitScreen(token, scores))
      setStep('chat')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (corrections: PatientCorrection[]) => {
    await api.confirmSummary(token, corrections)
    setStep('done')
  }

  if (error) {
    return (
      <main className="page page--center" id="main">
        <ErrorBox error={error} onRetry={load} />
        <p className="muted">{t('patient.invalidLink')}</p>
      </main>
    )
  }
  if (!session) {
    return (
      <main className="page page--center" id="main">
        <Loading />
      </main>
    )
  }

  switch (step) {
    case 'language':
      return <LanguagePicker onPick={pickLanguage} busy={busy} />
    case 'consent':
      return <Consent variant={session.consent_variant_needed} onAgree={agree} busy={busy} />
    case 'face':
      return <FacePage session={session} onSubmit={submitIntake} busy={busy} />
    case 'screen':
      return <Screen screen={session.screen!} language={lang} onSubmit={submitScreen} busy={busy} />
    case 'chat':
      return <Chat session={session} resumeToken={token} language={lang} onEnded={onEnded} />
    case 'generating':
      return (
        <main className="page page--center" id="main">
          <Loading label={t('patient.chat.generating')} />
        </main>
      )
    case 'summary':
      return <SummaryReview summary={summary ?? ''} onConfirm={confirm} />
    case 'done':
      return <ThankYou />
  }
}

/** The screen is shown once, after the face page, when the server offers items and none were submitted. */
function needsScreen(s: SessionState): boolean {
  return !!s.screen && s.screen.items.length > 0 && !s.screen.done
}

function initialStep(s: SessionState): Step {
  switch (s.status) {
    case 'intake':
      return 'language'
    case 'consented':
      return 'face'
    case 'active':
    case 'safety-halted':
      return 'chat'
    case 'wrapping-up':
      return 'generating'
    case 'summary-review':
      return 'summary'
    case 'completed':
    case 'abandoned':
      return 'done'
  }
}
