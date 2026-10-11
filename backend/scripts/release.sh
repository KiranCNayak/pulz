#!/bin/sh
# Fly.io release_command (backend/fly.toml): applies migrations before a new
# version goes live. See docs/DEPLOYMENT.md, Decision #71.
set -eu

# Neon's pooled string (PgBouncer, "-pooler" in the host) can't hold the
# session state migrations rely on, and a run through it can leave a
# migration lock behind. Stop with a clear message instead.
case "$DATABASE_URL" in
  *-pooler.*)
    echo "DATABASE_URL is Neon's pooled connection string. Use the direct one" >&2
    echo "(Neon -> Connect -> Connection pooling off): docs/DEPLOYMENT.md step 2." >&2
    exit 1
    ;;
esac

# Prisma's advisory lock only guards against two migrations running at
# once, which can't happen here: the one release machine is the only thing
# that migrates. A lock left behind by a killed run, though, blocked every
# later deploy until it was released by hand, so skip it.
export PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1
exec npx prisma migrate deploy
