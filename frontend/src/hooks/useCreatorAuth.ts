import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { getCreatorToken, setCreatorToken } from '@/lib/creatorAuth'

type RegisterResponse = {
  creatorId: string
  token: string
}

// Registers a new Creator (POST /auth/register, Decision #38) and stores
// the returned bearer token. No login — a token, once lost, is
// unrecoverable by design.
export function useRegisterCreator() {
  return useMutation({
    mutationFn: () => apiFetch<RegisterResponse>('/auth/register', { method: 'POST' }),
    onSuccess: (data) => setCreatorToken(data.token),
  })
}

export function hasCreatorToken(): boolean {
  return getCreatorToken() !== null
}
