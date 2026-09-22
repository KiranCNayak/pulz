import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateQuizPage } from './CreateQuizPage'

function renderPage() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreateQuizPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CreateQuizPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disables Create quiz until the title and question are filled in', () => {
    renderPage()

    const submit = screen.getByRole('button', { name: /create quiz/i })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Quiz title'), {
      target: { value: 'General Knowledge' },
    })
    fireEvent.change(screen.getByLabelText('Question 1'), {
      target: { value: 'What is 2 + 2?' },
    })
    fireEvent.change(screen.getByPlaceholderText('Option 1'), { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('Option 2'), { target: { value: '4' } })

    expect(submit).not.toBeDisabled()
  })

  it('registers a Creator (if needed) and creates the quiz on submit', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/register')) {
        return new Response(JSON.stringify({ creatorId: 'creator-1', token: 'secret-token' }), {
          status: 201,
        })
      }
      if (url.endsWith('/quizzes')) {
        return new Response(JSON.stringify({ id: 'quiz-1', questions: [] }), { status: 201 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(screen.getByLabelText('Quiz title'), {
      target: { value: 'General Knowledge' },
    })
    fireEvent.change(screen.getByLabelText('Question 1'), {
      target: { value: 'What is 2 + 2?' },
    })
    fireEvent.change(screen.getByPlaceholderText('Option 1'), { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('Option 2'), { target: { value: '4' } })

    fireEvent.click(screen.getByRole('button', { name: /create quiz/i }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/register')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/quizzes')
    expect(localStorage.getItem('pulz:creatorToken')).toBe('secret-token')
  })
})
