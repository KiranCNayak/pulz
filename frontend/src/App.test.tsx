import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('shows the home page at / with both ways in', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /quiz night/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create a quiz/i })).toHaveAttribute('href', '/create')
    expect(screen.getByLabelText('Join code')).toBeInTheDocument()
  })
})
