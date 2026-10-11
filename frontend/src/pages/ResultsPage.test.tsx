import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchResults, ResultsNotFoundError, type ResultsResponse } from '@/lib/resultsApi'
import { shareResultsImage } from '@/lib/resultsImage'
import { ResultsPage } from './ResultsPage'

vi.mock('@/lib/resultsApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/resultsApi')>('@/lib/resultsApi')
  return { ...actual, fetchResults: vi.fn() }
})

// jsdom has no canvas, so the drawing itself isn't exercised here.
vi.mock('@/lib/resultsImage', () => ({ shareResultsImage: vi.fn() }))

const mockedFetchResults = vi.mocked(fetchResults)
const mockedShare = vi.mocked(shareResultsImage)

function renderResultsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/results/session-1']}>
        <Routes>
          <Route path="/results/:sessionId" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ResultsPage', () => {
  beforeEach(() => {
    mockedFetchResults.mockReset()
    localStorage.clear()
  })

  it('shows the podium and a paginated ranks table', async () => {
    const response: ResultsResponse = {
      sessionId: 'session-1',
      quizId: 'quiz-1',
      generatedAt: new Date().toISOString(),
      totalParticipants: 5,
      podium: [
        { participantId: 'p1', displayName: 'Alice', score: 100, rank: 1 },
        { participantId: 'p2', displayName: 'Bob', score: 80, rank: 2 },
        { participantId: 'p3', displayName: 'Cara', score: 60, rank: 3 },
      ],
      ranks: [{ participantId: 'p4', displayName: 'Dee', score: 40, rank: 4 }],
      page: 1,
      pageSize: 10,
      totalPages: 2,
    }
    mockedFetchResults.mockResolvedValue(response)

    renderResultsPage()

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    expect(screen.getByText('5 participants')).toBeInTheDocument()
    expect(screen.getByText('Dee')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  const withCounts: ResultsResponse = {
    sessionId: 'session-1',
    quizId: 'quiz-1',
    generatedAt: new Date().toISOString(),
    totalParticipants: 4,
    podium: [
      { participantId: 'p1', displayName: 'Alice', avatar: { emoji: '🦊', color: 'orange' }, score: 5000, rank: 1, correctCount: 6, answeredCount: 8 },
      { participantId: 'p2', displayName: 'Bob', score: 4000, rank: 2, correctCount: 5, answeredCount: 8 },
      { participantId: 'p3', displayName: 'Cara', score: 3000, rank: 3, correctCount: 4, answeredCount: 8 },
    ],
    // Joined mid-game and answered 6.
    ranks: [{ participantId: 'p4', displayName: 'Dee', score: 2000, rank: 4, correctCount: 3, answeredCount: 6 }],
    page: 1,
    pageSize: 10,
    totalPages: 1,
  }

  it("shows each player's correct answers out of the answers they gave (Decision #72)", async () => {
    mockedFetchResults.mockResolvedValue(withCounts)
    renderResultsPage()

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    expect(screen.getByText('6 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText('3 of 6')).toBeInTheDocument()
    expect(screen.getByText('🦊')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Final results' })).toBeInTheDocument()
  })

  it('celebrates on the winner\'s own device only (Decision #76)', async () => {
    localStorage.setItem('pulz:participantId', 'p1')
    mockedFetchResults.mockResolvedValue(withCounts)
    renderResultsPage()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'You won!' })).toBeInTheDocument())
  })

  it('shares the results as an image, saying so when it fell back to a download (Decision #78)', async () => {
    mockedFetchResults.mockResolvedValue({ ...withCounts, quizTitle: 'Friday trivia' })
    mockedShare.mockResolvedValue('downloaded')
    renderResultsPage()

    await waitFor(() => expect(screen.getByText('Friday trivia')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Share results' }))

    await waitFor(() => expect(screen.getByText(/Image saved/)).toBeInTheDocument())
    expect(mockedShare).toHaveBeenCalledWith(expect.objectContaining({ quizTitle: 'Friday trivia' }))
  })

  it('shows an expired/empty state on a 404', async () => {
    mockedFetchResults.mockRejectedValue(new ResultsNotFoundError('Results not found or expired'))

    renderResultsPage()

    await waitFor(() =>
      expect(screen.getByText('Results no longer available')).toBeInTheDocument(),
    )
  })
})
