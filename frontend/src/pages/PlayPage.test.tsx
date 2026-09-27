import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayPage } from './PlayPage'

const listeners = new Map<string, (payload: unknown) => void>()

// Starts already connected, the way JoinPage hands the shared socket to
// PlayPage in production (no StrictMode reconnect to paper over it).
const fakeSocket = {
  id: 'sock-1',
  connected: true,
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

function serverEmits(event: string, payload?: unknown) {
  act(() => {
    listeners.get(event)?.(payload)
  })
}

const QUESTION = {
  questionId: 'q1',
  text: 'What is 2 + 2?',
  options: [
    { id: 'o1', text: '3' },
    { id: 'o2', text: '4' },
  ],
  timeLimitSeconds: 20,
  serverStartTime: 0,
  index: 0,
  total: 1,
}

function renderPlayPage() {
  render(
    <MemoryRouter initialEntries={['/play/ABC123']}>
      <Routes>
        <Route path="/play/:sessionId" element={<PlayPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayPage', () => {
  beforeEach(() => {
    listeners.clear()
    fakeSocket.emit.mockClear()
    localStorage.setItem('pulz:participantToken', 'participant-token')
  })

  it('re-joins on mount over an already-connected socket, then confirms the answer once acked', () => {
    render(
      <MemoryRouter initialEntries={['/play/ABC123']}>
        <Routes>
          <Route path="/play/:sessionId" element={<PlayPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(fakeSocket.emit).toHaveBeenCalledWith(
      'join:request',
      expect.objectContaining({ joinCode: 'ABC123', participantToken: 'participant-token' }),
    )

    serverEmits('join:accepted', { participantId: 'p1', participantToken: 'participant-token', role: 'PLAYER' })
    serverEmits('question:broadcast', {
      questionId: 'q1',
      text: 'What is 2 + 2?',
      options: [
        { id: 'o1', text: '3' },
        { id: 'o2', text: '4' },
      ],
      timeLimitSeconds: 20,
      serverStartTime: Date.now(),
      index: 0,
      total: 1,
    })

    fireEvent.click(screen.getByRole('button', { name: '4' }))
    expect(fakeSocket.emit).toHaveBeenCalledWith('answer:submit', { questionId: 'q1', selectedOptionId: 'o2' })
    expect(screen.queryByText(/Answer received/)).not.toBeInTheDocument()

    serverEmits('answer:ack', { received: true })
    expect(screen.getByText(/Answer received/)).toBeInTheDocument()
  })

  it("shows Time's up with the correct answer when the player didn't answer", () => {
    renderPlayPage()
    serverEmits('join:accepted', { participantId: 'p1', participantToken: 'participant-token', role: 'PLAYER' })
    serverEmits('question:broadcast', QUESTION)

    serverEmits('question:locked', { questionId: 'q1' })
    serverEmits('question:reveal', { questionId: 'q1', correctOptionId: 'o2', tally: { o1: 1, o2: 0 } })
    serverEmits('answer:result', { isCorrect: false, pointsEarned: 0, myRank: 2, totalPlayers: 2 })

    expect(screen.getByText("Time's up!")).toBeInTheDocument()
    expect(screen.getByText('+0 points')).toBeInTheDocument()
    expect(screen.getByText('Rank 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument() // "Correct answer: 4"
  })

  it('shows Not quite. (not Time\'s up) for a wrong answer', () => {
    renderPlayPage()
    serverEmits('join:accepted', { participantId: 'p1', participantToken: 'participant-token', role: 'PLAYER' })
    serverEmits('question:broadcast', QUESTION)
    fireEvent.click(screen.getByRole('button', { name: '3' }))

    serverEmits('question:reveal', { questionId: 'q1', correctOptionId: 'o2', tally: { o1: 1, o2: 0 } })
    serverEmits('answer:result', { isCorrect: false, pointsEarned: 0, myRank: 1, totalPlayers: 1 })

    expect(screen.getByText('Not quite.')).toBeInTheDocument()
  })
})
