import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameSocket } from './useGameSocket'

const listeners = new Map<string, (payload?: unknown) => void>()

const fakeSocket = {
  id: undefined as string | undefined,
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
    listeners.set(event, handler)
  }),
  off: vi.fn((event: string) => {
    listeners.delete(event)
  }),
}

vi.mock('@/lib/socket', () => ({
  getSocket: () => fakeSocket,
}))

function Consumer({ onConnect }: { onConnect: () => void }) {
  useGameSocket('session-1', onConnect)
  return null
}

function ErrorConsumer() {
  const { connectionError } = useGameSocket('session-1')
  return <p>{connectionError ?? 'no error'}</p>
}

function simulateConnect(id: string) {
  fakeSocket.id = id
  fakeSocket.connected = true
  act(() => {
    listeners.get('connect')?.()
  })
}

describe('useGameSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listeners.clear()
    fakeSocket.id = undefined
    fakeSocket.connected = false
    fakeSocket.connect.mockClear()
    fakeSocket.disconnect.mockClear()
  })

  it('runs onConnect immediately when the shared socket is already connected', () => {
    // JoinPage connects + joins on the shared socket just before
    // navigating to PlayPage — no further 'connect' event will fire.
    fakeSocket.id = 'sock-1'
    fakeSocket.connected = true
    const onConnect = vi.fn()

    render(<Consumer onConnect={onConnect} />)

    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(fakeSocket.connect).not.toHaveBeenCalled()
  })

  it('runs onConnect once per connection under StrictMode and does not churn the socket', () => {
    const onConnect = vi.fn()
    render(
      <StrictMode>
        <Consumer onConnect={onConnect} />
      </StrictMode>,
    )
    act(() => {
      vi.runAllTimers()
    })

    // StrictMode's mount -> unmount -> mount must not tear the socket down.
    expect(fakeSocket.disconnect).not.toHaveBeenCalled()

    simulateConnect('sock-1')
    expect(onConnect).toHaveBeenCalledTimes(1)

    // A transport-level reconnect is a new connection (new id) and must
    // re-authenticate.
    simulateConnect('sock-2')
    expect(onConnect).toHaveBeenCalledTimes(2)
  })

  it('surfaces a server-refused connection instead of hanging on "Connecting…"', () => {
    render(<ErrorConsumer />)
    simulateConnect('sock-1')

    act(() => {
      listeners.get('connection:error')?.({ error: 'Too many connections — slow down' })
      listeners.get('disconnect')?.('io server disconnect')
    })
    // The specific reason wins over the generic server-disconnect message.
    expect(screen.getByText('Too many connections — slow down')).toBeInTheDocument()
  })

  it('reports a bare server-initiated disconnect, but not an ordinary transport drop', () => {
    render(<ErrorConsumer />)
    simulateConnect('sock-1')

    act(() => {
      listeners.get('disconnect')?.('transport close')
    })
    expect(screen.getByText('no error')).toBeInTheDocument()

    act(() => {
      listeners.get('disconnect')?.('io server disconnect')
    })
    expect(screen.getByText('Disconnected by the server.')).toBeInTheDocument()
  })

  it('disconnects once the last consumer unmounts', () => {
    const { unmount } = render(<Consumer onConnect={vi.fn()} />)
    unmount()
    expect(fakeSocket.disconnect).not.toHaveBeenCalled()

    act(() => {
      vi.runAllTimers()
    })
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1)
  })
})
