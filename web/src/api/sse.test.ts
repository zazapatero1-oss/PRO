import { describe, expect, it } from 'vitest'
import { chatEvents, parseSse, toChatEvent, type RawSseEvent } from './sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of gen) out.push(x)
  return out
}

describe('parseSse', () => {
  it('parses event/data pairs separated by blank lines', async () => {
    const evs = await collect(parseSse(streamOf(['event: token\ndata: {"t":"Hi"}\n\nevent: status\ndata: {"a":1}\n\n'])))
    expect(evs).toEqual<RawSseEvent[]>([
      { event: 'token', data: '{"t":"Hi"}' },
      { event: 'status', data: '{"a":1}' },
    ])
  })

  it('handles chunks that split lines and multi-byte characters', async () => {
    const full = 'event: token\ndata: {"t":"¿Cómo está?"}\n\n'
    const bytes = new TextEncoder().encode(full)
    // Split in the middle of the multi-byte "ó".
    const cut = full.indexOf('ó') + 1
    const chunks = [bytes.slice(0, cut), bytes.slice(cut)]
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((ch) => c.enqueue(ch))
        c.close()
      },
    })
    const evs = await collect(parseSse(stream))
    expect(evs).toEqual([{ event: 'token', data: '{"t":"¿Cómo está?"}' }])
  })

  it('joins multi-line data, tolerates CRLF and comments, and defaults the event name', async () => {
    const evs = await collect(parseSse(streamOf([': keepalive\r\ndata: line1\r\ndata: line2\r\n\r\n', 'event: ended\ndata:{"reason":"turn_budget"}\n\n'])))
    expect(evs).toEqual([
      { event: 'message', data: 'line1\nline2' },
      { event: 'ended', data: '{"reason":"turn_budget"}' },
    ])
  })

  it('flushes a trailing event with no terminating blank line', async () => {
    const evs = await collect(parseSse(streamOf(['event: safety\ndata: {"message":"x"}'])))
    expect(evs).toEqual([{ event: 'safety', data: '{"message":"x"}' }])
  })
})

describe('toChatEvent / chatEvents', () => {
  it('decodes known events and drops unknown ones', async () => {
    expect(toChatEvent({ event: 'token', data: '{"t":"a"}' })).toEqual({ event: 'token', data: { t: 'a' } })
    expect(toChatEvent({ event: 'ping', data: '' })).toBeNull()
    const evs = await collect(chatEvents(streamOf(['event: ping\ndata: {}\n\nevent: evidence\ndata: {"construct_id":"x","severity":"mild","confidence":0.7}\n\n'])))
    expect(evs).toEqual([{ event: 'evidence', data: { construct_id: 'x', severity: 'mild', confidence: 0.7 } }])
  })

  it('turns malformed JSON into a non-retryable error event', () => {
    expect(toChatEvent({ event: 'status', data: '{oops' })).toEqual({ event: 'error', data: { retryable: false, message: 'Malformed event payload' } })
  })
})
