import { describe, expect, it } from 'vitest'
import { joinPageUrl } from './joinLink'

describe('joinPageUrl (Decision #77)', () => {
  it('links to /join on this site with the code filled in', () => {
    expect(joinPageUrl('ABC123')).toBe(`${window.location.origin}/join?code=ABC123`)
  })
})
