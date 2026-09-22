import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditQuizPage } from './EditQuizPage'

const QUIZ = {
  id: 'quiz-1',
  creatorId: 'creator-1',
  title: 'General Knowledge',
  coverImage: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  questions: [
    {
      id: 'q1',
      order: 0,
      text: 'What is 2 + 2?',
      mediaUrl: null,
      timeLimitSeconds: 20,
      options: [
        { id: 'o1', text: '3', isCorrect: false },
        { id: 'o2', text: '4', isCorrect: true },
      ],
    },
  ],
}

function renderPage() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/quizzes/quiz-1/edit']}>
        <Routes>
          <Route path="/quizzes/:quizId/edit" element={<EditQuizPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EditQuizPage — start session', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts a session and surfaces the join code and Host/Display links', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/quizzes/quiz-1') && (!init || init.method === undefined)) {
        return new Response(JSON.stringify(QUIZ), { status: 200 })
      }
      if (url.endsWith('/quizzes/quiz-1/sessions') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            sessionId: 'session-1',
            joinCode: 'ABC123',
            hostToken: 'host-secret',
            displayToken: 'display-secret',
            status: 'LOBBY',
            questionCount: 1,
          }),
          { status: 201 },
        )
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const startButton = await screen.findByRole('button', { name: /start session/i })
    expect(startButton).not.toBeDisabled()

    fireEvent.click(startButton)

    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open host controller/i })).toHaveAttribute(
      'href',
      '/host/session-1?token=host-secret',
    )
    expect(screen.getByRole('link', { name: /open display/i })).toHaveAttribute(
      'href',
      '/display/session-1?token=display-secret',
    )
  })
})
