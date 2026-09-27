// Shown when the server refuses or drops the socket connection itself
// (see useGameSocket's `connectionError`) — Socket.IO won't retry on its
// own after that, so point the user at a reload rather than leaving them
// on "Connecting…" indefinitely.
export function ConnectionErrorMessage({ error }: { error: string }) {
  return <div className="p-6 text-destructive">{error} Reload the page to try again.</div>
}
