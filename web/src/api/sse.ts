import type { ChatEvent } from '../types'

export interface RawSseEvent {
  event: string
  data: string
}

/**
 * Parses a text/event-stream body into discrete events. Handles multi-line `data:` fields,
 * CRLF/LF line endings, comments, and chunks that split mid-line. Used for the POST-based
 * chat-turn stream (EventSource only supports GET).
 */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<RawSseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = ''
  let dataLines: string[] = []

  const flush = (): RawSseEvent | null => {
    if (dataLines.length === 0 && eventName === '') return null
    const ev = { event: eventName || 'message', data: dataLines.join('\n') }
    eventName = ''
    dataLines = []
    return ev
  }

  const handleLine = (line: string): RawSseEvent | null => {
    if (line === '') return flush()
    if (line.startsWith(':')) return null
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    let value = idx === -1 ? '' : line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value
    else if (field === 'data') dataLines.push(value)
    // id / retry are ignored: the client owns its own single-retry policy.
    return null
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        const ev = handleLine(line)
        if (ev) yield ev
      }
    }
    buffer += decoder.decode()
    if (buffer.length > 0) {
      const ev = handleLine(buffer.replace(/\r$/, ''))
      if (ev) yield ev
    }
    const tail = flush()
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

const KNOWN = new Set(['token', 'evidence', 'status', 'safety', 'ended', 'error'])

/** Decodes a raw event into the typed §7.6 contract; unknown events return null. */
export function toChatEvent(raw: RawSseEvent): ChatEvent | null {
  if (!KNOWN.has(raw.event)) return null
  let data: unknown
  try {
    data = raw.data === '' ? {} : JSON.parse(raw.data)
  } catch {
    return { event: 'error', data: { retryable: false, message: 'Malformed event payload' } }
  }
  return { event: raw.event, data } as ChatEvent
}

export async function* chatEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  for await (const raw of parseSse(stream)) {
    const ev = toChatEvent(raw)
    if (ev) yield ev
  }
}
