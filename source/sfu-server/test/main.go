// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

//go:build !js
// +build !js

// sfu-media-server là một SFU Server chuyên dụng (Media Server),
// cung cấp REST API nội bộ để App Server điều khiển.
package main

import (
	"flag"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/pion/logging"
)

var (
	addr = flag.String("addr", ":8080", "http service address")
	log  = logging.NewDefaultLoggerFactory().NewLogger("sfu-media")
)

func main() {
	flag.Parse()

	// Tạo router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)

	// Health check endpoint
	r.Get("/health", healthCheckHandler)

	// API Routes
	r.Route("/api/peer", func(r chi.Router) {
		r.Post("/create", createPeerHandler)
		r.Post("/{peerId}/answer", setAnswerHandler)
		r.Post("/{peerId}/candidate", addCandidateHandler)
		r.Delete("/{peerId}", deletePeerHandler)
	})

	// Định kỳ gửi keyframe
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			roomManager.mu.RLock()
			for _, room := range roomManager.rooms {
				room.mu.Lock()
				room.DispatchKeyFrame()
				room.mu.Unlock()
			}
			roomManager.mu.RUnlock()
		}
	}()

	log.Infof("SFU Media Server starting on %s", *addr)
	log.Infof("API Endpoints:")
	log.Infof("  POST   /api/peer/create")
	log.Infof("  POST   /api/peer/{peerId}/answer")
	log.Infof("  POST   /api/peer/{peerId}/candidate")
	log.Infof("  DELETE /api/peer/{peerId}")
	log.Infof("  GET    /health")

	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Errorf("Failed to start server: %v", err)
	}
}
