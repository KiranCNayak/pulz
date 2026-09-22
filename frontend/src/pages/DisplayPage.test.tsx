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
      fakeSocket.emit('question:broadcast', {
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
      })
    })

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4' })).toBeDisabled()
  })
})
