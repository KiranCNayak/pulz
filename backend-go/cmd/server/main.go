// Command server is the entry point for the Go v2 performance-exploration
// backend. See docs/GO_V2_EXPLORATION.md at the repo root for why this
// exists, its scope, and what is/isn't ported yet.
//
// This is NOT the MVP backend. The real, shipping backend is ../backend
// (Node.js/TypeScript/Fastify). This module currently implements only a
// health check for comparability; quiz CRUD is not yet ported.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/kirancnayak/pulz/backend-go/internal/health"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", health.Handler)

	addr := ":" + port
	log.Printf("pulz backend-go (exploration) listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}
