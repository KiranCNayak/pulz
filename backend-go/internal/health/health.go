// Package health provides the liveness endpoint, mirroring the Node
// backend's GET /health (backend/src/routes/health.route.ts) so the two
// services are comparable from the first request onward.
package health

import (
	"encoding/json"
	"net/http"
	"time"
)

type response struct {
	Status string `json:"status"`
	Time   string `json:"time"`
}

// Handler responds 200 OK with a small JSON body, matching the shape of
// the Node backend's health check for an apples-to-apples comparison.
func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response{
		Status: "ok",
		Time:   time.Now().UTC().Format(time.RFC3339),
	})
}
