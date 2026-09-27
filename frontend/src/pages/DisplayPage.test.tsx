import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DisplayPage } from './DisplayPage'

// Minimal fake event emitter — avoids depending on Node types in app code.
class FakeSocket {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  connect = vi.fn()
  disconnect = vi.fn()
  on(event: string, handler: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }
  off(event: string, handler: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(handler)
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) handler(...args)
  }
}

const fakeSocket = new FakeSocket()

vi.mock('@/lib/socket', () => ({
  getSocket: () => fakeSocket,
}))

const QUESTION = {
  questionId: 'q1',
  text: 'What is 2 + 2?',
  options: [
    { id: 'a', text: '3' },
    { id: 'b', text: '4' },
  ],
  timeLimitSeconds: 20,
  serverStartTime: Date.now(),
  index: 0,
  total: 3,
}

function renderDisplayPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/display/:sessionId" element={<DisplayPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DisplayPage', () => {
  it('shows an error when no display token is present', () => {
    renderDisplayPage('/display/session-1')
    expect(screen.getByText(/Missing session id or display token/i)).toBeInTheDocument()
  })

  it('authenticates then renders the broadcast question read-only', () => {
    renderDisplayPage('/display/session-1?token=display-token')

    expect(screen.getByText(/Connecting/i)).toBeInTheDocument()

    act(() => {
      fakeSocket.emit('display:auth_ok')
    })
    expect(screen.getByText(/Waiting for the host/i)).toBeInTheDocument()

    act(() => {
      fakeSocket.emit('question:broadcast', QUESTION)
    })

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/Question 1/)).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    // Read-only: options render as plain tiles, not (even disabled) buttons.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the join code and the live player list in the lobby', () => {
    renderDisplayPage('/display/session-1?token=display-token')

    act(() => {
      fakeSocket.emit('display:auth_ok', {
        sessionId: 'session-1',
        status: 'LOBBY',
        joinCode: 'ABC123',
        participants: [{ id: 'p1', displayName: 'Priya', role: 'PLAYER' }],
      })
    })
    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText(/\/join$/)).toBeInTheDocument()
    expect(screen.getByText('Priya')).toBeInTheDocument()
    expect(screen.getByText('1 player')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for the host to start the game/)).toBeInTheDocument()

    act(() => {
      fakeSocket.emit('session:lobby_update', {
        participants: [
          { id: 'p1', displayName: 'Priya', role: 'PLAYER' },
          { id: 'p2', displayName: 'Mateo', role: 'PLAYER' },
        ],
      })
    })
    expect(screen.getByText('Mateo')).toBeInTheDocument()
    expect(screen.getByText('2 players')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the reveal and the leaderboard together once a question locks, then the podium', () => {
    renderDisplayPage('/display/session-1?token=display-token')

    act(() => {
      fakeSocket.emit('display:auth_ok', { sessionId: 'session-1', status: 'LOBBY', joinCode: 'ABC123' })
      fakeSocket.emit('question:broadcast', QUESTION)
    })

    // Same order the backend's lockQuestion emits them in, in one tick.
    act(() => {
      fakeSocket.emit('question:locked', { questionId: 'q1' })
      fakeSocket.emit('question:reveal', { questionId: 'q1', correctOptionId: 'b', tally: { a: 1, b: 2 } })
      fakeSocket.emit('leaderboard:update', {
        ranked: [
          { participantId: 'p1', displayName: 'Priya', score: 950, rank: 1 },
          { participantId: 'p2', displayName: 'Mateo', score: 900, rank: 2 },
          { participantId: 'p3', displayName: 'Sam', score: 0, rank: 3 },
        ],
      })
    })

    // The room still sees the question's answers (with the right one
    // marked) instead of jumping straight to a full-screen leaderboard.
    expect(screen.getByText('2 of 3 got it right!')).toBeInTheDocument()
    // Host locked well before the 20s timer ran out — not "Time's up".
    expect(screen.getByText('Answers locked')).toBeInTheDocument()
    expect(screen.queryByText(/Time.s up/)).not.toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeInTheDocument()
    expect(screen.getByText('Priya')).toBeInTheDocument()
    expect(screen.getByText('950')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    act(() => {
      fakeSocket.emit('game:ended', { resultsUrl: '/results/session-1' })
    })
    expect(screen.getByText('Game over!')).toBeInTheDocument()
    expect(screen.getByText('Priya')).toBeInTheDocument()
    expect(screen.getByText('950 pts')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
