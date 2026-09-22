import { defineConfig, devices } from '@playwright/test'

// Runs against the docker-compose stack (Decision #50) — `docker compose
// up` must already be running (frontend on :5173, backend on :3000).
// Not wired to auto-start docker-compose here since its Postgres
// healthcheck/migration startup time doesn't fit Playwright's webServer
// model well; see docs/FRONTEND_PLAN.md for the run instructions.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
