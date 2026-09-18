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
    expect(screen.getByText("We've talked about 6 of 9 areas")).toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite')
  })
})
