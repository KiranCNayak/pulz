import { useParams } from 'react-router-dom'

// Post-game results/podium page: /results/:sessionId. Not implemented yet.
export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <div>Results for session {sessionId} — not implemented yet</div>
}
