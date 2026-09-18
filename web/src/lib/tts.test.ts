import { describe, expect, it, vi } from 'vitest'
import { WebSpeechOutput } from './tts'

function fakeWindow() {
  const spoken: { text: string; lang: string }[] = []
  class Utterance {
    lang = ''
    rate = 1
    constructor(public text: string) {}
  }
  const speechSynthesis = {
    speak: vi.fn((u: Utterance) => spoken.push({ text: u.text, lang: u.lang })),
    cancel: vi.fn(),
  }
  return { win: { speechSynthesis, SpeechSynthesisUtterance: Utterance }, spoken, speechSynthesis }
}

describe('WebSpeechOutput', () => {
  it('reports unsupported when the browser lacks speechSynthesis', () => {
    expect(new WebSpeechOutput({}).supported).toBe(false)
  })

  it('speaks with the session locale and cancels any current speech first', () => {
    const { win, spoken, speechSynthesis } = fakeWindow()
    const out = new WebSpeechOutput(win)
    expect(out.supported).toBe(true)
    out.speak('Hola, ¿cómo estás?', 'es')
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1)
    expect(spoken).toEqual([{ text: 'Hola, ¿cómo estás?', lang: 'es-ES' }])
  })

  it('ignores empty text', () => {
    const { win, spoken } = fakeWindow()
    new WebSpeechOutput(win).speak('   ', 'en')
    expect(spoken).toEqual([])
  })
})
