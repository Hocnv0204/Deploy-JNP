// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

//go:build !js
// +build !js

// SFU Media Server — thành phần trung tâm xử lý truyền thông (Selective Forwarding Unit)
// Cung cấp REST API để App Server có thể điều khiển (tạo peer, gửi answer, candidate...).
package main

import (
	"flag"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/pion/logging"
)

// Các biến toàn cục cho địa chỉ server và logger
var (
	addr = flag.String("addr", ":8080", "http service address")
	log  logging.LeveledLogger
)

func main() {
	// Khởi tạo logger
	loggerFactory := logging.NewDefaultLoggerFactory()
	loggerFactory.DefaultLogLevel = logging.LogLevelInfo
	log = loggerFactory.NewLogger("sfu-media")

	flag.Parse() // Đọc các flag từ dòng lệnh

	// ===== Khởi tạo Router =====
	r := chi.NewRouter()

	// ===== Middleware =====
	r.Use(middleware.Logger)    // Log mỗi request HTTP
	r.Use(middleware.Recoverer) // Bắt panic và trả lỗi 500 thay vì crash server
	r.Use(middleware.RequestID) // Gán ID duy nhất cho mỗi request để dễ debug

	// ===== Endpoint kiểm tra sức khỏe =====
	r.Get("/health", healthCheckHandler)

	// ===== Các route điều khiển Peer =====
	r.Route("/api/peer", func(r chi.Router) {
		r.Post("/create", createPeerHandler)               // Tạo peer mới và trả về SDP offer
		r.Post("/{peerId}/answer", setAnswerHandler)       // Nhận SDP answer từ client
		r.Post("/{peerId}/candidate", addCandidateHandler) // Nhận ICE candidate từ client
		r.Delete("/{peerId}", deletePeerHandler)           // Xóa peer khỏi room (ngắt kết nối)
	})

	// ===== Goroutine chạy nền: gửi keyframe định kỳ =====
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			// Duyệt qua toàn bộ room và yêu cầu gửi keyframe
			roomManager.mu.RLock()
			for _, room := range roomManager.rooms {
				room.mu.Lock()
				room.DispatchKeyFrame() // Yêu cầu tất cả publisher gửi lại keyframe
				room.mu.Unlock()
			}
			roomManager.mu.RUnlock()
		}
	}()

	// ===== In thông tin endpoint =====
	log.Infof("SFU Media Server starting on %s", *addr)
	log.Infof("API Endpoints:")
	log.Infof("  POST   /api/peer/create")
	log.Infof("  POST   /api/peer/{peerId}/answer")
	log.Infof("  POST   /api/peer/{peerId}/candidate")
	log.Infof("  DELETE /api/peer/{peerId}")
	log.Infof("  GET    /health")

	// ===== Khởi chạy HTTP server =====
	if err := http.ListenAndServe(*addr, r); err != nil {
		log.Errorf("Failed to start server: %v", err)
	}
}
