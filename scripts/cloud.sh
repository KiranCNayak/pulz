#!/usr/bin/env bash
# `make cloud-up | cloud-down | cloud-status | cloud-deploy`: switch the
# hosted backend (one Fly.io machine) on and off, so it only costs money
# while you're using it. The frontend (Cloudflare Pages) and database
# (Neon) stay up; they're free while idle. See docs/DEPLOYMENT.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLY_CONFIG="$ROOT/backend/fly.toml"
APP="$(sed -n 's/^app = "\(.*\)"/\1/p' "$FLY_CONFIG")"
API_URL="${PULZ_API_URL:-https://pulz-api.knayak.fyi}"
APP_URL="${PULZ_APP_URL:-https://pulz.knayak.fyi}"

die() { echo "$*" >&2; exit 1; }

command -v fly >/dev/null 2>&1 || die "flyctl isn't installed: 'brew install flyctl', then 'fly auth login'."
fly auth whoami >/dev/null 2>&1 || die "Not logged in to Fly.io: run 'fly auth login'."

machine_ids() {
  fly machine list --app "$APP" --quiet 2>/dev/null | grep -E '^[0-9a-f]{8,}$' || true
}

healthy() { curl -sf --max-time 5 "$API_URL/health" >/dev/null; }

wait_healthy() {
  printf "Waiting for %s" "$API_URL"
  for _ in $(seq 1 60); do
    if healthy; then echo " ok"; return 0; fi
    printf "."; sleep 2
  done
  echo " timed out. 'fly logs --app $APP' shows why."
  return 1
}

case "${1:-}" in
  up)
    ids="$(machine_ids)"
    [ -n "$ids" ] || die "App '$APP' has no machine yet. Run 'make cloud-deploy' first (docs/DEPLOYMENT.md)."
    # shellcheck disable=SC2086 # one argument per machine id
    fly machine start $ids --app "$APP"
    wait_healthy
    echo ""
    echo "  Pulz is up:  $APP_URL"
    echo "  It keeps running (and billing) until 'make cloud-down'."
    ;;
  down)
    ids="$(machine_ids)"
    [ -n "$ids" ] || { echo "App '$APP' has no machines; nothing to stop."; exit 0; }
    # shellcheck disable=SC2086
    fly machine stop $ids --app "$APP"
    echo ""
    fly machine list --app "$APP"
    echo "Stopped. Live games are gone; quizzes and saved results are kept in the database."
    ;;
  status)
    fly machine list --app "$APP"
    if healthy; then echo "API: up ($API_URL)"; else echo "API: down ($API_URL)"; fi
    ;;
  deploy)
    # --local-only builds with your local Docker (no Fly builder machine);
    # --ha=false keeps it to one machine (Fly creates two by default).
    (cd "$ROOT/backend" && fly deploy --config "$FLY_CONFIG" --local-only --ha=false)
    echo ""
    fly machine list --app "$APP"
    echo "Deployed. If the machine above is started, it bills until 'make cloud-down'."
    ;;
  *)
    die "Usage: $0 up|down|status|deploy"
    ;;
esac
