# Local development shortcuts. Dev-only — not a deployment tool (see the
# note at the top of docker-compose.yml). `make` or `make help` lists targets.

COMPOSE ?= docker compose
APP_URL := http://localhost:5173
API_URL := http://localhost:3000

.DEFAULT_GOAL := help
.PHONY: help up down restart logs ps dev install demo test typecheck e2e clean

help: ## List the available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[1m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --renew-anon-volumes: node_modules lives in an anonymous volume, which
# would otherwise keep serving the old packages after a dependency change.
up: ## Start Postgres + backend + frontend in Docker and wait until they answer
	$(COMPOSE) up --build -d --renew-anon-volumes
	@printf "Waiting for the backend"; \
	for i in $$(seq 1 90); do curl -sf $(API_URL)/health >/dev/null && break; printf "."; sleep 1; done; \
	curl -sf $(API_URL)/health >/dev/null || { echo " timed out — run 'make logs'"; exit 1; }; echo " ok"
	@printf "Waiting for the frontend"; \
	for i in $$(seq 1 60); do curl -sf $(APP_URL) >/dev/null && break; printf "."; sleep 1; done; \
	curl -sf $(APP_URL) >/dev/null || { echo " timed out — run 'make logs'"; exit 1; }; echo " ok"
	@echo ""
	@echo "  Pulz is running"
	@echo "  App:      $(APP_URL)"
	@echo "  Backend:  $(API_URL)"
	@echo ""
	@echo "  'make demo' starts a playable game · 'make logs' follows logs · 'make down' stops"

down: ## Stop the Docker stack (keeps the database)
	$(COMPOSE) down

restart: down up ## Stop and start the Docker stack again

logs: ## Follow logs from every container
	$(COMPOSE) logs -f

ps: ## Show container status
	$(COMPOSE) ps

dev: ## Run backend + frontend natively (hot reload), Postgres in Docker; Ctrl-C stops both
	@./scripts/dev.sh

install: ## Install backend and frontend dependencies (for 'make dev' and the tests)
	cd backend && npm install
	cd frontend && npm install

demo: ## Seed an 8-question quiz, start a live session, print the join links
	cd backend && npm run demo

test: ## Run backend and frontend unit tests
	cd backend && npm test
	cd frontend && npm test

typecheck: ## Typecheck backend and build-check the frontend
	cd backend && npm run typecheck
	cd frontend && npx tsc -b

e2e: ## Run the Playwright suite against the running stack ('make up' first)
	cd frontend && npm run test:e2e

clean: ## Stop the Docker stack and delete the database volume
	$(COMPOSE) down -v
