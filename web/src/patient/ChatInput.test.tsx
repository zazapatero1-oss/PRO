import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { SpeechInput } from '../lib/speech'
import { ChatInput } from './ChatInput'

class FakeSpeech implements SpeechInput {
  supported = true
  onResult: SpeechInput['onResult'] = null
  onError: SpeechInput['onError'] = null
  onEnd: SpeechInput['onEnd'] = null
  started = 0
  start() {
    this.started += 1
  }
  stop() {
    this.onEnd?.()
  }
}

describe('ChatInput voice', () => {
  it('puts the transcript in the box for editing and sends with input_mode voice', () => {
    const fake = new FakeSpeech()
    const onSend = vi.fn()
    render(
      <I18nProvider initial="es">
        <ChatInput language="es" disabled={false} onSend={onSend} speechFactory={() => fake} />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hablar su respuesta' }))
    expect(fake.started).toBe(1)
    act(() => {
      fake.onResult?.('me duele la', false)
      fake.onResult?.('me duele la nariz', true)
      fake.onEnd?.()
    })
    const box = screen.getByLabelText('Su mensaje') as HTMLTextAreaElement
    expect(box.value).toBe('me duele la nariz')
    // The patient edits before sending.
    fireEvent.change(box, { target: { value: 'me duele la nariz por la noche' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onSend).toHaveBeenCalledWith('me duele la nariz por la noche', 'voice')
    expect(box.value).toBe('')
  })

  it('shows a fallback note when speech is unsupported', () => {
    const unsupported: SpeechInput = { supported: false, start() {}, stop() {}, onResult: null, onError: null, onEnd: null }
    render(
      <I18nProvider initial="en">
        <ChatInput language="en" disabled={false} onSend={() => {}} speechFactory={() => unsupported} />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Speak your reply' }))
    expect(screen.getByText(/Voice input isn't available/)).toBeInTheDocument()
  })
})
