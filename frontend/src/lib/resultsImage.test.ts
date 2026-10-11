import { describe, expect, it } from 'vitest'
import { fitText } from './resultsImage'

// A fake context where every character is 10px wide.
const ctx = { measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics }

describe('fitText (share image, Decision #78)', () => {
  it('leaves text that fits alone', () => {
    expect(fitText(ctx, 'Priya', 100)).toBe('Priya')
  })

  it('cuts a long name to fit, with an ellipsis', () => {
    const fitted = fitText(ctx, 'Bartholomew the Magnificent', 100)
    expect(fitted).toBe('Bartholom…')
    expect(fitted.length * 10).toBeLessThanOrEqual(100)
  })
})
