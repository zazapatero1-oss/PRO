import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSseStream } from '../api/mock/sse'

const chatTurn = vi.fn()
vi.mock('../api', async () => {
  const sse = await import('../api/sse')
  const errors = await import('../api/errors')
  return { api: { chatTurn: (...a: unknown[]) => chatTurn(...a) }, chatEvents: sse.chatEvents, isRetryable: errors.isRetryable, ApiError: errors.ApiError }
})

import { useChat } from './useChat'

const okStream = () =>
  fakeSseStream(
    [
      { event: 'token', data: { t: 'Hello ' } },
      { event: 'token', data: { t: 'there.' } },
      { event: 'status', data: { coverage: { covered: 1, total_active: 9 }, turns_used: 1, max_turns: 40 } },
    ],
    { speed: 0 },
  )

describe('useChat', () => {
  beforeEach(() => {
    chatTurn.mockReset()
    vi.useRealTimers()
  })

  it('streams a turn into state', async () => {
    chatTurn.mockResolvedValueOnce(okStream())
    const { result } = renderHook(() => useChat('s1', 'tok', null, () => {}))
    act(() => result.current.send('hi', 'text'))
    await waitFor(() => expect(result.current.state.phase).toBe('idle'))
    expect(result.current.state.messages.map((m) => m.content)).toEqual(['hi', 'Hello there.'])
    expect(result.current.state.coverage).toEqual({ covered: 1, total_active: 9 })
    expect(chatTurn).toHaveBeenCalledWith('s1', 'tok', 'hi', 'text', expect.any(AbortSignal))
  })

  it('retries once after 2 s on a retryable error event, then succeeds', async () => {
    vi.useFakeTimers()
    chatTurn
      .mockResolvedValueOnce(fakeSseStream([{ event: 'token', data: { t: 'partial' } }, { event: 'error', data: { retryable: true, message: 'blip' } }], { speed: 0 }))
      .mockResolvedValueOnce(okStream())
    const { result } = renderHook(() => useChat('s1', 'tok', null, () => {}))
    act(() => result.current.send('hi', 'voice'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(result.current.state.phase).toBe('retrying')
    expect(chatTurn).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1900)
    })
    expect(chatTurn).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(chatTurn).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(result.current.state.phase).toBe('idle')
    expect(result.current.state.messages.map((m) => m.content)).toEqual(['hi', 'Hello there.'])
  })

  it('gives up after the single retry and exposes resend', async () => {
    vi.useFakeTimers()
    chatTurn.mockRejectedValue(new TypeError('network down'))
    const { result } = renderHook(() => useChat('s1', 'tok', null, () => {}))
    act(() => result.current.send('hi', 'text'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(chatTurn).toHaveBeenCalledTimes(2)
    expect(result.current.state.phase).toBe('error')
    expect(result.current.state.pending).toEqual({ text: 'hi', inputMode: 'text' })
    chatTurn.mockResolvedValueOnce(okStream())
    act(() => result.current.resend())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(result.current.state.messages.filter((m) => m.role === 'patient')).toHaveLength(1)
    expect(result.current.state.phase).toBe('idle')
  })

  it('calls onEnded after an ended event', async () => {
    const onEnded = vi.fn()
    chatTurn.mockResolvedValueOnce(fakeSseStream([{ event: 'token', data: { t: 'Bye.' } }, { event: 'ended', data: { reason: 'patient_requested' } }], { speed: 0 }))
    const { result } = renderHook(() => useChat('s1', 'tok', null, onEnded))
    act(() => result.current.send('stop', 'text'))
    await waitFor(() => expect(onEnded).toHaveBeenCalledWith('patient_requested'))
    expect(result.current.state.phase).toBe('ended')
  })
})
