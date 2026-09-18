import { useEffect, useRef } from 'react'
import { useT } from '../i18n'
import type { InputMode, Language, SessionState } from '../types'
import { ChatInput } from './ChatInput'
import type { ChatState } from './chatReducer'
import { useChat } from './useChat'

interface Props {
  session: SessionState
  resumeToken: string
  language: Language
  onEnded: (reason: string) => void
}

export function Chat({ session, resumeToken, language, onEnded }: Props) {
  const { state, send, requestOpening, resend } = useChat(session.session_id, resumeToken, session, onEnded)

  // Opening message: requested once when the session has just been consented, or when an
  // active session somehow has no messages yet (SPEC §7.7).
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    if (session.status === 'consented' || (session.status === 'active' && session.messages.length === 0)) {
      opened.current = true
      requestOpening()
    }
  }, [session, requestOpening])

  return <ChatView state={state} language={language} onSend={send} onResend={resend} />
}

export function ChatView({
  state,
  language,
  onSend,
  onResend,
}: {
  state: ChatState
  language: Language
  onSend: (text: string, mode: InputMode) => void
  onResend: () => void
}) {
  const { t } = useT()
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.messages, state.phase])

  const inputDisabled = state.phase !== 'idle' && state.phase !== 'error'
  const showBreakHint = state.messages.length > 0 && state.phase === 'idle' && lastIsBreakAck(state)

  return (
    <div className="chat" id="main">
      <header className="chat__header">
        <h1 style={{ fontSize: '1.05rem', margin: 0 }}>{t('patient.chat.title')}</h1>
        {state.coverage && state.coverage.total_active > 0 && (
          <span className="chat__coverage" aria-live="polite">
            {t('patient.chat.coverage', { covered: state.coverage.covered, total: state.coverage.total_active })}
          </span>
        )}
      </header>

      <div className="chat__log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions text" aria-label={t('patient.chat.title')}>
        {state.messages.map((m) => (
          <div
            key={m.id}
            className={`bubble bubble--${m.role} ${m.streaming ? 'bubble--streaming' : ''}`}
            data-role={m.role}
          >
            <span className="visually-hidden">
              {m.role === 'patient' ? t('patient.chat.you') : m.role === 'safety' ? t('patient.chat.safetyTitle') : t('patient.chat.assistant')}:{' '}
            </span>
            {m.content}
          </div>
        ))}
        {(state.phase === 'sending' || state.phase === 'retrying') && (
          <div className="typing" role="status">
            {state.phase === 'retrying' ? t('patient.chat.retrying') : t('patient.chat.oneMoment')}
          </div>
        )}
        {state.phase === 'error' && (
          <div className="alert alert--danger" role="alert">
            <p style={{ margin: 0 }}>{t('patient.chat.failed')}</p>
            {state.error && <p className="small muted" style={{ margin: '4px 0 8px' }}>{state.error}</p>}
            {state.pending && (
              <button type="button" className="btn btn--sm" onClick={onResend}>
                {t('patient.chat.resend')}
              </button>
            )}
          </div>
        )}
        {state.phase === 'safety' && (
          <p className="bubble bubble--system" role="status">
            {t('patient.chat.halted')}
          </p>
        )}
        {state.phase === 'ended' && (
          <p className="bubble bubble--system" role="status">
            {t('patient.chat.generating')}
          </p>
        )}
      </div>

      <footer className="chat__footer">
        {state.phase !== 'safety' && state.phase !== 'ended' && (
          <div className="chat__controls">
            <button type="button" className="btn btn--sm" disabled={inputDisabled} onClick={() => onSend(t('patient.chat.skipPhrase'), 'text')}>
              {t('patient.chat.skip')}
            </button>
            <button type="button" className="btn btn--sm" disabled={inputDisabled} onClick={() => onSend(t('patient.chat.breakPhrase'), 'text')}>
              {t('patient.chat.break')}
            </button>
          </div>
        )}
        <ChatInput language={language} disabled={inputDisabled || state.phase === 'safety' || state.phase === 'ended'} onSend={onSend} />
        {showBreakHint && <p className="chat__hint">{t('patient.chat.paused')}</p>}
      </footer>
    </div>
  )
}

function lastIsBreakAck(state: ChatState): boolean {
  // The break hint is shown after the patient's last message was the break phrase.
  const patientMsgs = state.messages.filter((m) => m.role === 'patient')
  const last = patientMsgs[patientMsgs.length - 1]
  if (!last) return false
  return /break|pausa/i.test(last.content) && state.messages[state.messages.length - 1]?.role === 'assistant'
}
