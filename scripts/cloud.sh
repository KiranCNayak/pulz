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
  # flyctl pads each id with spaces in --quiet output (seen in v0.4.115),
  # so match the id as a whole field rather than as the whole line.
  fly machine list --app "$APP" --quiet 2>/dev/null | awk '$1 ~ /^[0-9a-f]+$/ && length($1) >= 8 { print $1 }' || true
}

healthy() { curl -sf --max-time 5 "$API_URL/health" >/dev/null; }

# One shared-cpu-1x 512 MB machine in sin, per hour (docs/DEPLOYMENT.md's
# cost table). Fly has no API that reports what you've been billed (its
# GraphQL org only says whether billing is current), so `down` estimates
# the run it just ended from the machine's own start event; the dashboard's
# billing page is the real number.
HOURLY_USD="0.0065"

# "Ran 1h 05m, about $0.0071" for every started machine, from the time its
# latest start event says it came up until now.
run_cost_estimate() {
  fly machine list --app "$APP" --json 2>/dev/null | jq -r --arg rate "$HOURLY_USD" '
    [ .[] | select(.state == "started")
      | ([.events[]? | select(.type == "start") | .timestamp] | max) as $started
      | select($started != null)
      | (now - $started / 1000) ] as $secs
    | if ($secs | length) == 0 then empty else
        ($secs | add) as $total
        | ($total / 3600 * ($rate | tonumber)) as $usd
        | "This run: \(($total / 3600) | floor)h \((($total % 3600) / 60) | floor | tostring | if length == 1 then "0" + . else . end)m, about $\(($usd * 10000 | round) / 10000) (estimate; exact figure at https://fly.io/dashboard/personal/billing)"
      end' || true
}

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
    # Before stopping: afterwards the machine has no "started" run to measure.
    cost="$(run_cost_estimate)"
    # shellcheck disable=SC2086
    fly machine stop $ids --app "$APP"
    echo ""
    fly machine list --app "$APP"
    echo "Stopped. Live games are gone; quizzes and saved results are kept in the database."
    if [ -n "$cost" ]; then echo "$cost"; else echo "It wasn't running, so nothing was billed for compute."; fi
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
