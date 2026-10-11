# Observability — Pulz

How Pulz is monitored, and the one-time steps to turn it on. The why is in
`ARCHITECTURE.md` §13 and Decision #70; this is the runbook.

## What you get

| Signal | Source | Where to look in Grafana |
|---|---|---|
| Is it up? | Synthetic Monitoring check on `GET /health` | Testing & synthetics → Synthetics |
| Game activity: live sessions, players, answers, joins | `backend/src/observability/metrics.ts` | **Pulz overview** dashboard |
| Abuse signals: rate-limit rejections, bad join codes | same | **Pulz overview** → Gameplay |
| API latency and errors per route | OTel HTTP + Fastify instrumentation | **Pulz overview** → HTTP API |
| Event loop, heap, GC | OTel runtime instrumentation | **Pulz overview** → Node.js runtime |
| What happened in one request or socket event | Traces (`POST /quizzes`, `receive answer:submit`, …) | Explore → Tempo, or Application Observability |
| Backend logs, linked to their trace | pino → OTLP | **Pulz overview** → Logs, or Explore → Loki |
| Browser errors, Web Vitals, page loads, browser → API traces | Grafana Faro | Frontend → Frontend Observability |

Everything is off until configured: no `OTEL_EXPORTER_OTLP_ENDPOINT` on the
backend, or no `VITE_FARO_URL` at frontend build time, means nothing is
collected or sent.

## Try it locally first

```bash
make observe     # the normal stack plus a local Grafana (grafana/otel-lgtm)
make demo        # in another terminal; play the game it prints
```

Open <http://localhost:3001> → Dashboards → Pulz → **Pulz overview**.

![The Pulz overview dashboard after three scripted games](screenshots/observability.jpg)

Metrics are exported once a minute, so give panels a minute or two. Live
gauges (sessions, players, sockets) only move if a game is running when an
export happens. `make down` stops everything, including Grafana.

The local Grafana has no Faro receiver, so frontend telemetry can only be
tried against Grafana Cloud. For `make dev` (native backend) instead of
Docker, set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in
`backend/.env` while `make observe`'s Grafana is running.

## Set up Grafana Cloud (one-time)

Assumes the backend is deployed (Fly.io, `pulz-api.knayak.fyi`) and the
frontend is on Cloudflare Pages (`pulz.knayak.fyi`). Grafana's UI moves
things around occasionally; the names below are the ones to search for.

### 1. Create the stack

Sign up at <https://grafana.com> (free, no card) and create a stack. Pick
the region closest to the Fly region you deploy to.

### 2. Backend → Grafana Cloud

1. In the Grafana Cloud portal, open your stack → **OpenTelemetry** →
   *Configure*. Generate a token. The page then shows ready-made values for
   `OTEL_EXPORTER_OTLP_ENDPOINT` (like
   `https://otlp-gateway-prod-<zone>.grafana.net/otlp`) and
   `OTEL_EXPORTER_OTLP_HEADERS` (`Authorization=Basic%20<base64>`). Keep the
   `%20`: the OTel SDK URL-decodes the header value.
2. Give them to the backend as secrets:

   ```bash
   fly secrets set \
     OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp-gateway-prod-<zone>.grafana.net/otlp" \
     OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic%20<base64>" \
     OTEL_RESOURCE_ATTRIBUTES="deployment.environment.name=production"
   ```

   Don't add `service.namespace` to the resource attributes. Grafana builds
   the `job` label from it, and the dashboard and alerts filter on
   `job="pulz-backend"`.
3. `fly secrets set` restarts the machine. Within a couple of minutes,
   Explore → the `grafanacloud-*-prom` datasource should show
   `pulz_games_started_total`.

### 3. Frontend → Grafana Cloud (Faro)

1. Grafana → **Frontend Observability** → *Create new app*. Name it
   `pulz-frontend` and set the allowed origin (CORS) to
   `https://pulz.knayak.fyi`.
2. Copy the collector URL it gives you
   (`https://faro-collector-prod-<zone>.grafana.net/collect/<key>`).
3. Cloudflare Pages → the Pulz project → Settings → Environment variables:
   add `VITE_FARO_URL` with that URL (production), then redeploy. Vite bakes
   it in at build time, so it only takes effect on a new build.

The collector URL is public by design: it ships in the JavaScript bundle.
The allowed-origin setting is what stops other sites from using it.

### 4. Import the dashboard

Grafana → Dashboards → New → **Import** → upload
`observability/grafana/dashboards/pulz-overview.json`. At the top of the
dashboard, set **Metrics** to the `grafanacloud-*-prom` datasource and
**Logs** to `grafanacloud-*-logs`, then save. When you change a panel, export
the JSON back into the repo so local and cloud stay in step.

### 5. Uptime check

Grafana → Testing & synthetics → **Synthetics** → Add new check → **HTTP**:

- URL: `https://pulz-api.knayak.fyi/health`
- Frequency: **2 minutes**, from **2 probe locations** (e.g. one near your
  Fly region, one far away). That's about 44k of the free 100k executions a
  month; 1 minute from 2 probes (~89k) also fits, with little headroom.
- Turn on its built-in alerting.

**Cost trade-off:** any check every few minutes keeps the Fly machine
running all the time, so auto-stop never kicks in. That costs about
$3/month for a 512 MB machine instead of ~$0, and also removes cold starts
for visitors. If you'd rather keep the machine stopping when idle, skip this
check. `/health` doesn't touch Postgres, so checks never wake Neon either
way.

### 6. Alerts

Grafana → Alerting → **Alert rules** → New alert rule, one per row below.
The default contact point emails the account owner. Add Slack or similar
under Contact points if you want.

| Alert | Query (`grafanacloud-*-prom` unless noted) | Fire when | Why |
|---|---|---|---|
| Backend down | Synthetics check (its own alerting, step 5) | Probes fail | Nothing else can tell you it's unreachable |
| Server errors | `sum(increase(http_server_request_duration_seconds_count{job="pulz-backend", http_response_status_code=~"5.."}[10m]))` | `> 3` | Failing REST calls (create quiz, start session, results) |
| Event loop blocked | `max(nodejs_eventloop_delay_p99_seconds{job="pulz-backend"})` | `> 0.2` for 5m | One process serves every game; a blocked loop lags them all |
| Memory climbing | `sum(v8js_memory_heap_used_bytes{job="pulz-backend"})` | `> 300000000` for 10m | Live games live in memory (Decision #16); the machine has 512 MB |
| Abuse | `sum(increase(pulz_rate_limit_rejections_total{job="pulz-backend"}[10m]))` | `> 50` | The in-process limiters are being hammered (§11) |
| Join-code guessing | `sum(increase(pulz_join_attempts_total{job="pulz-backend", outcome="invalid_code"}[10m]))` | `> 30` | Someone trying codes; the lockout is holding, but worth knowing |
| Error logs | Loki: `sum(count_over_time({service_name="pulz-backend"} \| detected_level=~"error\|fatal" [10m]))` | `> 0` | Anything the backend logged as an error |

For every rule except the synthetic check, set **"Alert state if no data"**
to **Normal**. When the Fly machine is stopped there is no data at all,
which isn't an outage; being unreachable is the synthetic check's job.

## Staying inside the free tier

| Free limit | Pulz usage |
|---|---|
| 10k active metric series | ~200 (measured locally); a few hundred at most once every route and status has been hit |
| 50 GB logs / month | Fastify logs ~2 lines per request: well under 1 GB at hobby traffic |
| 50 GB traces / month | One small trace per request or socket event: well under 1 GB |
| 50k Faro sessions / month | One per browser visit |
| 100k synthetic executions / month | ~44k at the recommended setting |
| 14-day retention | Fine for "what went wrong this week" |

Over a limit, the free tier drops the excess. It doesn't bill you or lock
the account.

## Adding a metric

Put it in `backend/src/observability/metrics.ts`, named `pulz.<thing>`.
Every attribute value must come from a small, fixed, server-defined set:
never a session id, join code, display name or anything a client sends. One
unbounded attribute can use up the 10k-series budget on its own. Add the
known attribute values to the zero-initialisation block there, otherwise the
first event after each restart is invisible to `rate()` and `increase()`.
Then add a panel to `pulz-overview.json` and check it with `make observe`.

## Known gaps

- **Prisma queries aren't traced.** `@prisma/instrumentation` v5 needs the
  older OTel SDK line; add it with the Prisma 6 upgrade.
- **Browser → backend traces cover REST only.** Socket.IO events start
  their own traces on the server; the browser has no span for them to join.
- **The first request per HTTP route after a restart** doesn't show up in
  rates. Same counter-starts-at-1 effect as above, but these series come
  from auto-instrumentation and can't be pre-created. Irrelevant once
  there's steady traffic.
- **Each deploy starts new series** (the `host_name` label is the machine
  id). Old ones go stale and stop counting toward the active-series budget.
