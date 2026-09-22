import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HostPage } from './HostPage'

const listeners = new Map<string, (payload: unknown) => void>()

const fakeSocket = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    listeners.set(event, handler)
  }),
  off: vi.fn((event: string) => {
    listeners.delete(event)
  }),
}

vi.mock('@/lib/socket', () => ({
  getSocket: () => fakeSocket,
}))

function renderHostPage(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/host/:sessionId" element={<HostPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HostPage', () => {
  beforeEach(() => {
    listeners.clear()
    fakeSocket.emit.mockClear()
  })

  it('prompts for a host token when none is supplied', () => {
    renderHostPage('/host/session-1')

    expect(screen.getByPlaceholderText('Host token')).toBeInTheDocument()
    expect(fakeSocket.emit).not.toHaveBeenCalledWith('host:auth', expect.anything())
  })

  it('authenticates and renders the lobby once host:auth_ok arrives', () => {
    renderHostPage('/host/session-1?token=host-token-abc')

    expect(fakeSocket.emit).toHaveBeenCalledWith('host:auth', {
      sessionId: 'session-1',
      hostToken: 'host-token-abc',
    })

    act(() => {
      listeners.get('host:auth_ok')?.({
        sessionId: 'session-1',
        joinCode: 'ABC123',
        status: 'LOBBY',
        questionCount: 2,
        currentQuestionIndex: 0,
        participants: [{ id: 'p1', displayName: 'Alice' }],
      })
    })

    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Start game')).toBeInTheDocument()
  })
})
