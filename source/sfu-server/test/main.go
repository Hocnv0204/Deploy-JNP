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

	"github.com/pion/logging"
)

var (
	addr = flag.String("addr", ":8080", "http service address")
	log  = logging.NewDefaultLoggerFactory().NewLogger("sfu-media")
)

func main() {
	flag.Parse()

	// API Routes
	http.HandleFunc("/api/peer/create", createPeerHandler)
	http.HandleFunc("/api/peer/", func(w http.ResponseWriter, r *http.Request) {
		// Route to appropriate handler based on path
		if r.URL.Path == "/api/peer/create" {
			createPeerHandler(w, r)
		} else if len(r.URL.Path) > len("/api/peer/") {
			if r.URL.Path[len(r.URL.Path)-7:] == "/answer" {
				setAnswerHandler(w, r)
			} else if r.URL.Path[len(r.URL.Path)-10:] == "/candidate" {
				addCandidateHandler(w, r)
			} else if r.Method == http.MethodDelete {
				deletePeerHandler(w, r)
			} else {
				http.NotFound(w, r)
			}
		} else {
			http.NotFound(w, r)
		}
	})

	// Health check endpoint
	http.HandleFunc("/health", healthCheckHandler)

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
