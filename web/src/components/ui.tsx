import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { severityVar } from '../lib/severity'
import type { Language, Severity } from '../types'
import { LANGUAGES } from '../types'

export function Loading({ label }: { label?: string }) {
  const { t } = useT()
  return (
    <p className="muted" role="status" aria-live="polite">
      {label ?? t('common.loading')}
    </p>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="alert alert--danger" role="alert">
      <p style={{ margin: 0 }}>
        {t('common.error')} <span className="small muted">{message}</span>
      </p>
      {onRetry && (
        <button type="button" className="btn btn--sm" style={{ marginTop: 8 }} onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

export function LanguageSwitch({ value, onChange }: { value?: Language; onChange?: (l: Language) => void }) {
  const { t, lang, setLang } = useT()
  const current = value ?? lang
  const id = useId()
  return (
    <label className="small" htmlFor={id}>
      <span className="visually-hidden">{t('common.language')}</span>
      <select
        id={id}
        className="select"
        style={{ minHeight: 36, padding: '4px 28px 4px 8px', width: 'auto' }}
        value={current}
        onChange={(e) => {
          const l = e.target.value as Language
          setLang(l)
          onChange?.(l)
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {t(`enum.language.${l}`)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useT()
  return (
    <span className="badge badge--sev" style={{ background: severityVar(severity) }}>
      {t(`enum.severity.${severity}`)}
    </span>
  )
}

export function SeverityDot({ severity, title }: { severity: Severity; title?: string }) {
  return <span className="sev-dot" style={{ background: severityVar(severity) }} title={title} aria-hidden="true" />
}

/** Click/focus-toggled tooltip that works on touch screens (hover-only tooltips do not). */
export function Tooltip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span className="tooltip" ref={ref}>
      <button
        type="button"
        className="tooltip__btn"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="tooltip__body">
          {text}
        </span>
      )}
    </span>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    } else if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" onCancel={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <div>{body}</div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

export function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="steps" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`steps__dot ${i <= current ? 'steps__dot--done' : ''}`} />
      ))}
    </div>
  )
}
