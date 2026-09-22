import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchResults, ResultsNotFoundError, type ResultsResponse } from '@/lib/resultsApi'
import { ResultsPage } from './ResultsPage'

vi.mock('@/lib/resultsApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/resultsApi')>('@/lib/resultsApi')
  return { ...actual, fetchResults: vi.fn() }
})

const mockedFetchResults = vi.mocked(fetchResults)

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

  it('shows an expired/empty state on a 404', async () => {
    mockedFetchResults.mockRejectedValue(new ResultsNotFoundError('Results not found or expired'))

    renderResultsPage()

    await waitFor(() =>
      expect(screen.getByText('Results no longer available')).toBeInTheDocument(),
    )
  })
})
