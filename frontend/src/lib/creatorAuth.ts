const CREATOR_TOKEN_KEY = 'pulz:creatorToken'

// The Creator bearer token is returned exactly once by POST /auth/register
// (Decision #38) — there is no recovery if this is lost/cleared.
export function getCreatorToken(): string | null {
  return localStorage.getItem(CREATOR_TOKEN_KEY)
}

export function setCreatorToken(token: string): void {
  localStorage.setItem(CREATOR_TOKEN_KEY, token)
}
