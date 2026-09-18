// Voice input behind a small interface so the Web Speech API can be swapped for a server-side
// transcriber later without touching the chat UI.

export type SpeechErrorCode = 'not-allowed' | 'no-speech' | 'network' | 'aborted' | 'unsupported' | 'other'

export interface SpeechInput {
  readonly supported: boolean
  start(): void
  stop(): void
  /** Called with interim and final transcripts; `final` is true when the phrase is complete. */
  onResult: ((text: string, final: boolean) => void) | null
  onError: ((code: SpeechErrorCode) => void) | null
  onEnd: (() => void) | null
}

// Minimal typing of the (still prefixed) Web Speech API.
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; length: number; [i: number]: SRAlternative }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string }
interface SR {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SRCtor = new () => SR

function getCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const BCP47: Record<string, string> = { en: 'en-US', es: 'es-ES' }

export class WebSpeechInput implements SpeechInput {
  readonly supported: boolean
  onResult: SpeechInput['onResult'] = null
  onError: SpeechInput['onError'] = null
  onEnd: SpeechInput['onEnd'] = null
  private rec: SR | null = null
  private lang: string
  private finalText = ''

  constructor(lang: string) {
    this.lang = BCP47[lang] ?? lang
    this.supported = getCtor() !== null
  }

  start() {
    const Ctor = getCtor()
    if (!Ctor) {
      this.onError?.('unsupported')
      return
    }
    this.stop()
    const rec = new Ctor()
    rec.lang = this.lang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    this.finalText = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) this.finalText += r[0].transcript
        else interim += r[0].transcript
      }
      this.onResult?.((this.finalText + interim).trim(), interim === '' && this.finalText !== '')
    }
    rec.onerror = (e) => {
      const map: Record<string, SpeechErrorCode> = {
        'not-allowed': 'not-allowed',
        'service-not-allowed': 'not-allowed',
        'no-speech': 'no-speech',
        network: 'network',
        aborted: 'aborted',
      }
      this.onError?.(map[e.error] ?? 'other')
    }
    rec.onend = () => {
      this.rec = null
      this.onEnd?.()
    }
    this.rec = rec
    try {
      rec.start()
    } catch {
      this.onError?.('other')
    }
  }

  stop() {
    if (this.rec) {
      const r = this.rec
      this.rec = null
      try {
        r.stop()
      } catch {
        /* already stopped */
      }
    }
  }
}

export function createSpeechInput(lang: string): SpeechInput {
  return new WebSpeechInput(lang)
}
