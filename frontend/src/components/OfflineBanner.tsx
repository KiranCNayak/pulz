import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/api'

const RECHECK_MS = 15_000

/**
 * The hosted backend runs on demand (docs/DEPLOYMENT.md, Decision #71):
 * between games it's switched off while this frontend is still served.
 * Checks /health once on load; while the backend is unreachable it shows a
 * notice and re-checks every 15s, so the page notices when the host
 * switches it back on. Once the backend answers it stops checking, so an
 * open tab never adds traffic of its own.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      const up = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(8_000) })
        .then((response) => response.ok)
        .catch(() => false)
      if (cancelled) return
      setOffline(!up)
      if (!up) timer = setTimeout(check, RECHECK_MS)
    }

    void check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  if (!offline) return null

  return (
    <div role="status" className="bg-stage px-4 py-2.5 text-center text-sm text-stage-foreground">
      <span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full bg-primary motion-safe:animate-pulse" />
      <span className="font-semibold">Pulz is offline right now.</span>{' '}
      <span className="text-stage-muted">It's switched on for games, and this page will notice when it's back.</span>
    </div>
  )
}
