import { useParams } from 'react-router-dom'

// Display/cast view: /display/:sessionId — read-only, safe to project publicly. Not implemented yet.
export function DisplayPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <div>Display for session {sessionId} — not implemented yet</div>
}
