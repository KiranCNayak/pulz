import { useEffect } from 'react'

/** Sets the browser tab title to "<title> · Pulz" (or just "Pulz"). */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Pulz` : 'Pulz · Live quiz games'
  }, [title])
}
