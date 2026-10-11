const FARO_URL = import.meta.env.VITE_FARO_URL
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// Grafana Faro — the frontend half of docs/OBSERVABILITY.md: JS errors,
// Web Vitals, sessions, and fetch spans that send a `traceparent` to the
// backend so a slow API call is one trace from click to database. Off
// unless VITE_FARO_URL is set; the SDK is a lazily loaded chunk, so dev
// and E2E runs never download it.
export async function initObservability(): Promise<void> {
  if (!FARO_URL) return

  const [{ getWebInstrumentations, initializeFaro }, { TracingInstrumentation }] = await Promise.all([
    import('@grafana/faro-web-sdk'),
    import('@grafana/faro-web-tracing'),
  ])

  initializeFaro({
    url: FARO_URL,
    app: { name: 'pulz-frontend', environment: import.meta.env.MODE },
    // Engine.io long-polling is transport noise — Socket.IO events are
    // traced on the backend instead.
    ignoreUrls: [/\/socket\.io\//],
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({
        instrumentationOptions: {
          // Cross-origin, so the header must be opted in per origin. The
          // backend's CORS reflects requested headers, so no change there.
          propagateTraceHeaderCorsUrls: [new RegExp(`^${API_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)],
        },
      }),
    ],
  })
}
