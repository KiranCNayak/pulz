# backend-go — Go v2 performance-exploration backend.
# See ../docs/GO_V2_EXPLORATION.md for scope, status, and required tooling.

.PHONY: run build test lint dev bench-health

run:
	go run ./cmd/server

build:
	go build -o bin/server ./cmd/server

test:
	go test ./...

# Requires: go install github.com/golangci-lint/golangci-lint/cmd/golangci-lint@latest
lint:
	golangci-lint run ./...

# Requires: go install github.com/air-verse/air@latest
dev:
	air

# Requires: go install github.com/rakyll/hey@latest
# Requires the server already running (see `make run`) on $PORT (default 8080).
bench-health:
	hey -n 10000 -c 100 http://localhost:$${PORT:-8080}/health
