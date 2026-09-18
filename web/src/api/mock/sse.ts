export interface SseFrame {
  event: string
  data: unknown
  /** delay before this frame, ms */
  delay?: number
}

const encoder = new TextEncoder()

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

function frame(f: SseFrame): Uint8Array {
  return encoder.encode(`event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
}

/**
 * Builds a byte stream shaped exactly like the chat-turn SSE response. Text is split into
 * word-ish token frames with jittered pacing so the streaming UI behaves like production.
 */
export function fakeSseStream(frames: SseFrame[], opts: { signal?: AbortSignal; speed?: number } = {}): ReadableStream<Uint8Array> {
  const speed = opts.speed ?? 1
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const f of frames) {
          if (f.delay) await sleep(f.delay * speed, opts.signal)
          controller.enqueue(frame(f))
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}

/** Turns a reply into token frames: ~3 words per frame at 25–70 ms. */
export function tokenFrames(text: string, seed = 1): SseFrame[] {
  const words = text.split(/(\s+)/).filter((w) => w.length > 0)
  const frames: SseFrame[] = []
  let chunk = ''
  let n = 0
  let r = seed
  const rand = () => {
    // Tiny LCG for deterministic jitter in tests.
    r = (r * 1103515245 + 12345) & 0x7fffffff
    return r / 0x7fffffff
  }
  for (const w of words) {
    chunk += w
    if (!/^\s+$/.test(w)) n += 1
    if (n >= 2 + Math.floor(rand() * 2)) {
      frames.push({ event: 'token', data: { t: chunk }, delay: 25 + Math.floor(rand() * 45) })
      chunk = ''
      n = 0
    }
  }
  if (chunk) frames.push({ event: 'token', data: { t: chunk }, delay: 30 })
  return frames
}
