import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useT } from '../i18n'
import { createSpeechInput, type SpeechErrorCode, type SpeechInput } from '../lib/speech'
import type { InputMode, Language } from '../types'

interface Props {
  language: Language
  disabled: boolean
  onSend: (text: string, mode: InputMode) => void
  speechFactory?: (lang: string) => SpeechInput
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {active ? (
        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
      ) : (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3M8 21h8" />
        </>
      )}
    </svg>
  )
}

export function ChatInput({ language, disabled, onSend, speechFactory = createSpeechInput }: Props) {
  const { t } = useT()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<InputMode>('text')
  const [listening, setListening] = useState(false)
  const [micNote, setMicNote] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Text present before the mic was pressed, so the transcript appends instead of replacing.
  const prefix = useRef('')

  const speech = useMemo(() => speechFactory(language), [speechFactory, language])
  const supported = speech.supported

  useEffect(() => {
    speech.onResult = (transcript, final) => {
      setText((prefix.current ? prefix.current + ' ' : '') + transcript)
      if (final) setMode('voice')
    }
    speech.onError = (code: SpeechErrorCode) => {
      setListening(false)
      const key = code === 'not-allowed' ? 'denied' : code === 'unsupported' ? 'unsupported' : code === 'no-speech' || code === 'aborted' ? null : 'error'
      setMicNote(key ? t(`patient.chat.mic.${key}`) : null)
    }
    speech.onEnd = () => setListening(false)
    return () => speech.stop()
  }, [speech, t])

  const toggleMic = useCallback(() => {
    if (!supported) {
      setMicNote(t('patient.chat.mic.unsupported'))
      return
    }
    if (listening) {
      speech.stop()
      setListening(false)
      return
    }
    prefix.current = text.trim()
    setMicNote(null)
    setListening(true)
    speech.start()
  }, [supported, listening, speech, text, t])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const value = text.trim()
    if (!value || disabled) return
    if (listening) {
      speech.stop()
      setListening(false)
    }
    onSend(value, mode)
    setText('')
    setMode('text')
    prefix.current = ''
    textareaRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // Auto-grow the textarea up to the CSS max-height.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  return (
    <form onSubmit={submit}>
      <div className="chat__input-row">
        <label htmlFor="chat-input" className="visually-hidden">
          {t('patient.chat.inputLabel')}
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          className="textarea"
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            // Editing a transcript keeps input_mode "voice"; clearing the box resets it.
            if (e.target.value.trim() === '') setMode('text')
          }}
          onKeyDown={onKeyDown}
          placeholder={listening ? t('patient.chat.mic.listening') : t('patient.chat.placeholder')}
          disabled={disabled}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button
          type="button"
          className="btn btn--icon"
          onClick={toggleMic}
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? t('patient.chat.mic.stop') : t('patient.chat.mic.start')}
          title={supported ? undefined : t('patient.chat.mic.unsupported')}
        >
          <MicIcon active={listening} />
        </button>
        <button type="submit" className="btn btn--primary" disabled={disabled || !text.trim()}>
          {t('patient.chat.send')}
        </button>
      </div>
      {(micNote || listening) && (
        <p className="chat__hint" role="status">
          {listening ? t('patient.chat.mic.listening') : micNote}
        </p>
      )}
    </form>
  )
}
