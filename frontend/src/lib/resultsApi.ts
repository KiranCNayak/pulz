import type { Avatar } from '@/lib/avatars'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// avatar and the counts are absent from results saved before Decisions
// #72/#74, which can still be read until their TTL runs out.
export type PodiumEntry = {
  participantId: string
  displayName: string
  avatar?: Avatar
  score: number
  rank: number
  /** Correct answers out of answers given (Decision #72). */
  correctCount?: number
  answeredCount?: number
}

export type ResultsResponse = {
  sessionId: string
  quizId: string
  /** Absent on results saved before Decision #78. */
  quizTitle?: string
  generatedAt: string
  totalParticipants: number
  podium: PodiumEntry[]
  ranks: PodiumEntry[]
  page: number
  pageSize: number
  totalPages: number
}

export class ResultsNotFoundError extends Error {}

// GET /results/:sessionId (backend/src/routes/session.route.ts) — no auth,
// the sessionId UUID is the access control (PRD §9). 404 means the
// snapshot doesn't exist or its TTL (Decision #14) has expired.
export async function fetchResults(
  sessionId: string,
  page: number,
  pageSize: number,
): Promise<ResultsResponse> {
  const url = new URL(`${API_URL}/results/${sessionId}`)
  url.searchParams.set('page', String(page))
  url.searchParams.set('pageSize', String(pageSize))

  const response = await fetch(url)

  if (response.status === 404) {
    throw new ResultsNotFoundError('Results not found or expired')
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch results (${response.status})`)
  }

  return (await response.json()) as ResultsResponse
}
