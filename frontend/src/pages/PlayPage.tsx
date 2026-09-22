import { useParams } from 'react-router-dom'

// Player/Spectator gameplay: /play/:sessionId. Not implemented yet.
export function PlayPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <div>Play session {sessionId} — not implemented yet</div>
}
