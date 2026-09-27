import { defineConfig, devices } from '@playwright/test'

// Runs against the docker-compose stack (Decision #50) — `docker compose
// up` must already be running (frontend on :5173, backend on :3000).
// Not wired to auto-start docker-compose here since its Postgres
// healthcheck/migration startup time doesn't fit Playwright's webServer
// model well; see docs/FRONTEND_PLAN.md for the run instructions.
//
// Each spec registers a fresh Creator (Decision #38's capability-token
// auth has no login to reuse). POST /auth/register is rate-limited to
// 10/hour per IP in production (Decision #38); the dev docker-compose
// stack raises that via REGISTER_RATE_LIMIT_PER_HOUR (Decision #60) so
// the suite can be run repeatedly. If you run against a backend without
// that override, ~3 full runs an hour will trip it (429s in the backend
// log) — `docker compose restart backend` resets it.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // All specs share one live docker-compose backend/DB, not an isolated
  // instance per worker — run spec files serially so two tests don't
  // race each other's sessions/rate limits.
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
