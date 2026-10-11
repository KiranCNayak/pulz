import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from './OfflineBanner'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('OfflineBanner', () => {
  it('stays hidden while the backend answers, and checks only once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()

    render(<OfflineBanner />)
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows while the backend is unreachable and clears once it comes back', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()

    render(<OfflineBanner />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole('status')).toHaveTextContent('Pulz is offline right now.')

    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
