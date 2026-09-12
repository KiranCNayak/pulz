# backend-go (exploration only — not the MVP backend)

This is a **performance-comparison exploration**, not a replacement for
`../backend` (the real, shipping Node.js/TypeScript MVP backend). See
[`../docs/GO_V2_EXPLORATION.md`](../docs/GO_V2_EXPLORATION.md) for the full
rationale, scope, stack choices, and benchmark methodology, and
[`../docs/DECISIONS.md`](../docs/DECISIONS.md) #28 for how this got
started.

**Status:** health check only. Quiz CRUD and the DB layer are not ported
yet.

## Quick start

```
go run ./cmd/server        # or: make run
curl localhost:8080/health
```

## Tooling this module expects (install yourself, not bundled)

```
go install github.com/rakyll/hey@latest                                    # load testing
go install github.com/golangci-lint/golangci-lint/cmd/golangci-lint@latest  # linting
go install github.com/air-verse/air@latest                                 # hot reload
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest                        # DB codegen (once DB layer is ported)
```

See the `Makefile` for the corresponding `make lint` / `make dev` /
`make bench-health` targets.
