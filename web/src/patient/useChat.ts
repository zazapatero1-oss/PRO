import { useCallback, useEffect, useReducer, useRef } from 'react'
import { api, chatEvents, isRetryable } from '../api'
import type { InputMode, SessionState } from '../types'
import { chatReducer, initialChatState, type ChatState } from './chatReducer'

const RETRY_DELAY_MS = 2000

class RetryableTurn extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface UseChat {
  state: ChatState
  send: (text: string, inputMode: InputMode) => void
  requestOpening: () => void
  resend: () => void
}

/**
 * Drives one chat-turn at a time: opens the SSE stream, feeds events to the reducer, and
 * retries a failed turn exactly once after 2 s (SPEC §7.6). `onEnded` fires after an
 * `ended` event so the flow can call end-session.
 */
export function useChat(sessionId: string, resumeToken: string, initial: SessionState | null, onEnded: (reason: string) => void): UseChat {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const busy = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded

  // Hydrate once per session. Refs survive StrictMode's dev double-mount, so the opening
  // stream requested by the first mount is not wiped by a second hydrate. There is
  // deliberately no abort-on-unmount: in dev it would cancel that same stream.
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (initial && hydratedFor.current !== initial.session_id) {
      hydratedFor.current = initial.session_id
      dispatch({ type: 'hydrate', state: initial })
    }
  }, [initial])

  const run = useCallback(
    async (text: string | null, inputMode: InputMode | null, resend = false) => {
      if (busy.current) return
      busy.current = true
      dispatch({ type: 'turn_start', text, inputMode, resend })
      let ended: string | null = null

      const attempt = async () => {
        const ac = new AbortController()
        abort.current = ac
        const stream = await api.chatTurn(sessionId, resumeToken, text, inputMode, ac.signal)
        for await (const ev of chatEvents(stream)) {
          if (ev.event === 'error' && ev.data.retryable) throw new RetryableTurn(ev.data.message)
          dispatch({ type: 'event', event: ev })
          if (ev.event === 'ended') ended = ev.data.reason
        }
      }

      try {
        try {
          await attempt()
        } catch (e) {
          if (!(e instanceof RetryableTurn) && !isRetryable(e)) throw e
          dispatch({ type: 'retrying' })
          await sleep(RETRY_DELAY_MS)
          await attempt()
        }
        dispatch({ type: 'stream_done' })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        dispatch({ type: 'failed', message: e instanceof Error ? e.message : String(e) })
      } finally {
        busy.current = false
        abort.current = null
      }
      if (ended) onEndedRef.current(ended)
    },
    [sessionId, resumeToken],
  )

  const send = useCallback((text: string, inputMode: InputMode) => void run(text, inputMode), [run])
  const requestOpening = useCallback(() => void run(null, null), [run])
  const resend = useCallback(() => {
    if (state.pending) void run(state.pending.text, state.pending.inputMode, true)
  }, [run, state.pending])

  return { state, send, requestOpening, resend }
}
