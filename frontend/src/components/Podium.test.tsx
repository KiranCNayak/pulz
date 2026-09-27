import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Podium } from './Podium'

function slotOf(name: string): string | undefined {
  // Each entry's column carries its visual slot as a flex `order-*` class.
  return screen.getByText(name).parentElement?.className.match(/order-\d/)?.[0]
}

describe('Podium', () => {
  it('keeps the winner in the middle even when 2nd place is tied', () => {
    render(
      <Podium
        entries={[
          { rank: 2, name: 'Bea', score: 10 },
          { rank: 1, name: 'Ava', score: 50 },
          { rank: 2, name: 'Cal', score: 10 },
        ]}
      />,
    )

    expect(slotOf('Ava')).toBe('order-2') // centre
    expect(slotOf('Bea')).toBe('order-1') // left
    expect(slotOf('Cal')).toBe('order-3') // right
  })

  it('shows full names and scores, never truncated', () => {
    render(<Podium entries={[{ rank: 1, name: 'Maximilian-Alexandrovich', score: 950 }]} />)

    const name = screen.getByText('Maximilian-Alexandrovich')
    expect(name.className).not.toMatch(/truncate/)
    expect(screen.getByText('950 pts')).toBeInTheDocument()
  })
})
