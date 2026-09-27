import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HostPage } from './HostPage'

const listeners = new Map<string, (payload: unknown) => void>()

const fakeSocket = {
  connected: false,
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

  it('authenticates with a pasted token on an already-connected socket', () => {
    renderHostPage('/host/session-1')
    act(() => {
      listeners.get('connect')?.(undefined)
    })
    expect(fakeSocket.emit).not.toHaveBeenCalledWith('host:auth', expect.anything())

    fakeSocket.connected = true
    try {
      fireEvent.change(screen.getByPlaceholderText('Host token'), { target: { value: ' pasted-token ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    } finally {
      fakeSocket.connected = false
    }

    expect(fakeSocket.emit).toHaveBeenCalledWith('host:auth', { sessionId: 'session-1', hostToken: 'pasted-token' })
    expect(screen.getByText(/Connecting/i)).toBeInTheDocument()
  })

  it('authenticates and renders the lobby once host:auth_ok arrives', () => {
    renderHostPage('/host/session-1?token=host-token-abc')

    // useGameSocket only emits host:auth from its socket 'connect'
    // handler (so a transport-level reconnect re-authenticates too, not
    // just a page reload) — the fake socket's connect() is a no-op spy,
    // so simulate the real Socket.IO client's async 'connect' event.
    act(() => {
      listeners.get('connect')?.(undefined)
    })

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

  function authenticate(status: 'LOBBY' | 'IN_PROGRESS' = 'LOBBY') {
    renderHostPage('/host/session-1?token=host-token-abc')
    act(() => {
      listeners.get('connect')?.(undefined)
      listeners.get('host:auth_ok')?.({
        sessionId: 'session-1',
        joinCode: 'ABC123',
        status,
        questionCount: 2,
        currentQuestionIndex: 0,
        participants: [
          { id: 'p1', displayName: 'Alice' },
          { id: 'p2', displayName: 'Bob' },
        ],
      })
    })
  }

  const question = {
    questionId: 'q1',
    text: 'What is 2 + 2?',
    options: [
      { id: 'o1', text: '3' },
      { id: 'o2', text: '4' },
    ],
    timeLimitSeconds: 20,
    serverStartTime: 0,
    index: 1,
    total: 2,
  }

  it('restores a locked question, its standings and the Next button after a mid-game refresh', () => {
    renderHostPage('/host/session-1?token=host-token-abc')
    act(() => {
      listeners.get('connect')?.(undefined)
      listeners.get('host:auth_ok')?.({
        sessionId: 'session-1',
        joinCode: 'ABC123',
        status: 'IN_PROGRESS',
        questionCount: 2,
        currentQuestionIndex: 1,
        participants: [{ id: 'p1', displayName: 'Alice' }],
        live: {
          question: { ...question, phase: 'LOCKED' },
          lockReason: 'all_answered',
          reveal: { questionId: 'q1', correctOptionId: 'o2', tally: { o1: 0, o2: 1 } },
          ranked: [{ participantId: 'p1', displayName: 'Alice', score: 950, rank: 1 }],
          resultsUrl: null,
        },
      })
    })

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    expect(screen.getByText(/Everyone answered/)).toBeInTheDocument()
    expect(screen.getAllByText('950').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(fakeSocket.emit).toHaveBeenCalledWith('host:next_question')
  })

  it('shows the status, join code, and emits game:start from the lobby', () => {
    authenticate()

    expect(screen.getByText('Host Controller')).toBeInTheDocument()
    expect(screen.getByText('LOBBY')).toBeInTheDocument()
    expect(screen.getByText('players in the lobby').previousElementSibling).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(fakeSocket.emit).toHaveBeenCalledWith('game:start')
  })

  it('runs a question: countdown, lock, reveal with tallies, leaderboard, next', () => {
    authenticate()
    act(() => listeners.get('question:broadcast')?.(question))

    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument()
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveAccessibleName('20 seconds left')

    fireEvent.click(screen.getByRole('button', { name: 'Lock question' }))
    expect(fakeSocket.emit).toHaveBeenCalledWith('host:lock_question')

    act(() => {
      listeners.get('question:locked')?.({ questionId: 'q1' })
      listeners.get('question:reveal')?.({ questionId: 'q1', correctOptionId: 'o2', tally: { o1: 1, o2: 3 } })
      listeners.get('leaderboard:update')?.({
        ranked: [
          { participantId: 'p2', displayName: 'Bob', score: 950, rank: 1 },
          { participantId: 'p1', displayName: 'Alice', score: 0, rank: 2 },
        ],
      })
    })

    expect(screen.queryByRole('button', { name: 'Lock question' })).not.toBeInTheDocument()
    expect(screen.getByText(/Locked · 4 answers/)).toBeInTheDocument()
    expect(screen.getByText(/Next ends the game/)).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('950')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(fakeSocket.emit).toHaveBeenCalledWith('host:next_question')
  })

  it('approves or denies spectator promotion requests', () => {
    authenticate()
    act(() => {
      listeners.get('promotion:incoming')?.({ participantId: 's1', displayName: 'Spec One' })
      listeners.get('promotion:incoming')?.({ participantId: 's2', displayName: 'Spec Two' })
    })

    const [approveFirst] = screen.getAllByRole('button', { name: 'Approve' })
    fireEvent.click(approveFirst)
    expect(fakeSocket.emit).toHaveBeenCalledWith('promotion:decision', { participantId: 's1', approve: true })
    expect(screen.queryByText('Spec One')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(fakeSocket.emit).toHaveBeenCalledWith('promotion:decision', { participantId: 's2', approve: false })
    expect(screen.queryByText('Spec Two')).not.toBeInTheDocument()
  })

  it('shows the ended state with a results link', () => {
    authenticate()
    act(() => listeners.get('game:ended')?.({ resultsUrl: '/results/session-1' }))

    expect(screen.getByText('ENDED')).toBeInTheDocument()
    expect(screen.getByText('Game ended.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View results' })).toHaveAttribute('href', '/results/session-1')
  })
})
