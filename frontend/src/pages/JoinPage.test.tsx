import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JoinPage } from './JoinPage'

const handlers = new Map<string, (payload: unknown) => void>()
const mockSocket = {
  connect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn((event: string, cb: (payload: unknown) => void) => handlers.set(event, cb)),
  off: vi.fn((event: string) => handlers.delete(event)),
}

vi.mock('@/lib/socket', () => ({
  getSocket: () => mockSocket,
}))

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

describe('JoinPage', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('emits join:request and navigates to /play/:code on join:accepted', () => {
    render(
      <MemoryRouter>
        <JoinPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/join code/i), { target: { value: 'abc123' } })
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    expect(mockSocket.emit).toHaveBeenCalledWith('join:request', { joinCode: 'ABC123', displayName: 'Alice' })

    act(() => {
      handlers.get('join:accepted')?.({ participantId: 'p1', participantToken: 'tok', role: 'PLAYER' })
    })

    expect(localStorage.getItem('pulz:participantToken')).toBe('tok')
    expect(navigateMock).toHaveBeenCalledWith('/play/ABC123')
  })

  it('shows the server error on join:error', () => {
    render(
      <MemoryRouter>
        <JoinPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/join code/i), { target: { value: 'ZZZZZZ' } })
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    act(() => {
      handlers.get('join:error')?.({ error: 'Invalid or expired join code' })
    })

    expect(screen.getByText('Invalid or expired join code')).toBeInTheDocument()
  })
})
