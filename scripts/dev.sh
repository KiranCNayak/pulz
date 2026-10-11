#!/usr/bin/env bash
# `make dev`: Postgres in Docker, backend and frontend as local Node
# processes with hot reload. Ctrl-C stops both (Postgres keeps running;
# `make down` stops it). For the all-in-Docker stack use `make up` instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Without a backend/.env, use the same dev values as docker-compose.yml.
# With one, leave it in charge (exported variables would override it).
if [ ! -f backend/.env ]; then
  export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/pulz?schema=public}"
  export REGISTER_RATE_LIMIT_PER_HOUR="${REGISTER_RATE_LIMIT_PER_HOUR:-1000}"
fi

for port in 3000 5173; do
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. If the Docker stack is running, stop it with 'make down' first." >&2
    exit 1
  fi
done

for app in backend frontend; do
  if [ ! -d "$app/node_modules" ]; then
    echo "Installing $app dependencies..."
    (cd "$app" && npm install)
  fi
done

echo "Starting Postgres..."
docker compose up -d postgres
for _ in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1 \
  || { echo "Postgres did not become ready" >&2; exit 1; }

echo "Applying database migrations..."
(cd backend && npx prisma generate >/dev/null && npx prisma migrate deploy)

# Job control puts each background job in its own process group, so
# cleanup can stop the whole npm -> tsx/vite tree, not just the subshell.
set -m
pids=()
cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "Stopping backend and frontend..."
  for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# Prefix each line so the two log streams stay readable when interleaved.
(cd backend && npm run dev 2>&1 | sed -u 's/^/[backend]  /') &
pids+=($!)
(cd frontend && npm run dev 2>&1 | sed -u 's/^/[frontend] /') &
pids+=($!)

echo ""
echo "  App:      http://localhost:5173"
echo "  Backend:  http://localhost:3000"
echo "  Ctrl-C to stop"
echo ""

wait
