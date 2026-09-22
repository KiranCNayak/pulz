import { getCreatorToken } from '@/lib/creatorAuth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Thin fetch wrapper: base URL + JSON handling + Creator bearer token
// (Decision #38) attached automatically when present. REST calls go
// through TanStack Query hooks that wrap this (Decision #40).
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getCreatorToken()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, body?.error ?? response.statusText)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
