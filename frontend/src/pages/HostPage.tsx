import { useParams } from 'react-router-dom'

// Host controller: /host/:sessionId — interactive game control. Not implemented yet.
export function HostPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <div>Host Controller for session {sessionId} — not implemented yet</div>
}
