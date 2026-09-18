// Read-aloud behind a small interface, mirroring speech.ts, so a server-side voice can replace
// the browser's speechSynthesis later without touching the chat UI.

import type { Language } from '../types'

export interface SpeechOutput {
  readonly supported: boolean
  speak(text: string, language: Language): void
  cancel(): void
}

const LOCALE: Record<Language, string> = { en: 'en-US', es: 'es-ES' }

interface SynthLike {
  speak(u: unknown): void
  cancel(): void
}
interface UtteranceCtor {
  new (text: string): { lang: string; rate: number }
}

export class WebSpeechOutput implements SpeechOutput {
  readonly supported: boolean
  private synth: SynthLike | null
  private Utterance: UtteranceCtor | null

  constructor(win: unknown = typeof window !== 'undefined' ? window : undefined) {
    const w = (win ?? {}) as { speechSynthesis?: SynthLike; SpeechSynthesisUtterance?: UtteranceCtor }
    this.synth = w.speechSynthesis ?? null
    this.Utterance = w.SpeechSynthesisUtterance ?? null
    this.supported = Boolean(this.synth && this.Utterance)
  }

  speak(text: string, language: Language): void {
    if (!this.synth || !this.Utterance || !text.trim()) return
    this.synth.cancel()
    const u = new this.Utterance(text)
    u.lang = LOCALE[language] ?? language
    u.rate = 0.95
    this.synth.speak(u)
  }

  cancel(): void {
    this.synth?.cancel()
  }
}

export function createSpeechOutput(): SpeechOutput {
  return new WebSpeechOutput()
}
