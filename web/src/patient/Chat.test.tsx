import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Language } from '../types'
import { ChatView } from './Chat'
import { initialChatState, type ChatState } from './chatReducer'

function renderChat(lang: Language, state: Partial<ChatState> = {}) {
  const onSend = vi.fn()
  render(
    <I18nProvider initial={lang}>
      <ChatView state={{ ...initialChatState, ...state }} language={lang} onSend={onSend} onResend={() => {}} />
    </I18nProvider>,
  )
  return onSend
}

describe('ChatView control buttons', () => {
  it('Skip sends the English control phrase as a text turn', () => {
    const onSend = renderChat('en')
    fireEvent.click(screen.getByRole('button', { name: 'Skip this' }))
    expect(onSend).toHaveBeenCalledWith('skip', 'text')
  })

  it('Take a break sends the Spanish control phrase when the session is in Spanish', () => {
    const onSend = renderChat('es')
    fireEvent.click(screen.getByRole('button', { name: 'Hacer una pausa' }))
    expect(onSend).toHaveBeenCalledWith('Necesito una pausa', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Saltar esto' }))
    expect(onSend).toHaveBeenCalledWith('saltar', 'text')
  })

  it('disables the controls while a turn is in flight and hides them after safety', () => {
    renderChat('en', { phase: 'sending' })
    expect(screen.getByRole('button', { name: 'Skip this' })).toBeDisabled()
    expect(screen.getByText('One moment…')).toBeInTheDocument()
  })

  it('renders the safety message, disables input and shows the coverage text', () => {
    renderChat('en', {
      phase: 'safety',
      coverage: { covered: 6, total_active: 9 },
      messages: [{ id: 'a', role: 'safety', content: 'Fixed safety copy' }],
    })
    expect(screen.getByText('Fixed safety copy')).toBeInTheDocument()
    expect(screen.getByLabelText('Your message')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Skip this' })).toBeNull()
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite')
  })
})

describe('ChatView phase-aware progress (v1.1 §F)', () => {
  const coverage = { covered: 6, total_active: 9 }

  it('shows nothing until the first status has arrived', () => {
    renderChat('en')
    expect(screen.queryByText('Getting the picture')).toBeNull()
  })

  it('names the triage, explore and wrap-up phases in English', () => {
    const { unmount } = render(
      <I18nProvider initial="en">
        <ChatView
          state={{ ...initialChatState, coverage, sessionPhase: 'triage' }}
          language="en"
          onSend={() => {}}
          onResend={() => {}}
        />
      </I18nProvider>,
    )
    expect(screen.getByText('Getting the picture')).toBeInTheDocument()
    unmount()

    renderChat('en', {
      coverage,
      sessionPhase: 'explore',
      currentFocus: 'appearance.nose',
      focusProgress: { confirmed: 2, total: 5 },
    })
    expect(screen.getByText('Going deeper: 2 of 5 areas')).toBeInTheDocument()
    // The focus is named subtly next to the progress, not instead of it.
    expect(screen.getByText('· your nose')).toBeInTheDocument()
  })

  it('translates the phase wording and the focus label into Spanish', () => {
    renderChat('es', {
      coverage,
      sessionPhase: 'explore',
      currentFocus: 'function.breathing',
      focusProgress: { confirmed: 1, total: 3 },
    })
    expect(screen.getByText('Profundizando: 1 de 3 temas')).toBeInTheDocument()
    expect(screen.getByText('· su respiración')).toBeInTheDocument()
  })

  it('falls back to the coverage wording when the backend sends no focus progress', () => {
    renderChat('en', { coverage, sessionPhase: 'explore', focusProgress: null })
    expect(screen.getByText("We've talked about 6 of 9 areas")).toBeInTheDocument()
  })

  it('says it is wrapping up, and keeps the progress region live', () => {
    renderChat('es', { coverage, sessionPhase: 'wrap-up' })
    const region = screen.getByText('Cerrando la conversación')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('leaves an unknown focus construct unnamed rather than showing an id', () => {
    renderChat('en', {
      coverage,
      sessionPhase: 'explore',
      currentFocus: 'unknown.construct',
      focusProgress: { confirmed: 0, total: 4 },
    })
    expect(screen.getByText('Going deeper: 0 of 4 areas')).toBeInTheDocument()
    expect(screen.queryByText(/unknown\.construct/)).toBeNull()
  })
})
