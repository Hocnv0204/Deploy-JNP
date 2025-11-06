// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

package main

import (
	"encoding/json"
	"fmt"
	"github.com/go-chi/chi/v5"  // Import router chi, dùng để điều hướng URL
	"github.com/google/uuid"    // Import thư viện UUID để tạo ID duy nhất
	"github.com/pion/webrtc/v4" // Import thư viện WebRTC chính của Pion
	"net/http"
)

// createPeerHandler xử lý POST /api/peer/create
// Tạo PeerConnection mới và trả về SDP Offer
func createPeerHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Đọc và parse request body từ App Server
	var req CreatePeerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 2. Kiểm tra dữ liệu bắt buộc (roomId)
	if req.RoomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	log.Infof("Creating peer for room: %s", req.RoomID)

	// 3. Tạo một PeerConnection mới với cấu hình mặc định (STUN/TURN...)
	settingEngine := webrtc.SettingEngine{}

	// Chỉ định dải cổng UDP mà Pion được phép sử dụng
	if err := settingEngine.SetEphemeralUDPPortRange(50000, 50100); err != nil {
		log.Errorf("Failed to set ephemeral UDP port range: %v", err)
		http.Error(w, "Server configuration error", http.StatusInternalServerError)
		return
	}

	// Tạo một API mới với Setting Engine đã được cấu hình
	api := webrtc.NewAPI(webrtc.WithSettingEngine(settingEngine))

	// Khai báo cấu hình STUN/TURN
	iceServers := []webrtc.ICEServer{
		{
			URLs: []string{"stun:stun.relay.metered.ca:80"},
		},
		{
			URLs: []string{
				"turn:global.relay.metered.ca:80",
				"turn:global.relay.metered.ca:80?transport=tcp",
				"turn:global.relay.metered.ca:443",
				"turns:global.relay.metered.ca:443?transport=tcp",
			},
			Username:   "b25f13a908741ebc9b2a58c7",
			Credential: "flOn9NEcWNvD8clt",
		},
	}

	// Sử dụng danh sách iceServers đã được cấu hình
	peerConnection, err := api.NewPeerConnection(webrtc.Configuration{
		ICEServers: iceServers,
	})
	if err != nil {
		log.Errorf("Failed to create PeerConnection: %v", err)
		http.Error(w, "Failed to create peer connection", http.StatusInternalServerError)
		return
	}

	// 4. Tạo PeerState (trạng thái) để quản lý kết nối này
	peerID := uuid.New().String()                   // Tạo ID duy nhất cho peer này
	room := roomManager.GetOrCreateRoom(req.RoomID) // Lấy hoặc tạo phòng từ RoomManager

	peer := &PeerState{
		id:             peerID,
		roomID:         req.RoomID,
		peerConnection: peerConnection,
		webhookURL:     req.WebhookURL, // Lưu URL webhook để gửi sự kiện về App Server
		room:           room,           // Liên kết peer này với phòng của nó
	}

	// 5. Lưu trữ peer state vào các trình quản lý
	peerManager.mu.Lock()
	peerManager.peers[peerID] = peer // Thêm vào danh sách quản lý chung
	peerManager.mu.Unlock()

	room.AddPeer(peer) // Thêm peer vào danh sách thành viên của phòng

	// 6. (QUAN TRỌNG) Thiết lập Transceiver (kênh truyền media)
	// SFU luôn *nhận* media từ client.
	// Chúng ta chủ động thêm 2 transceiver (1 video, 1 audio) ở chế độ "Recvonly" (Chỉ nhận).
	// Điều này báo cho client biết "hãy chuẩn bị gửi 1 audio và 1 video".
	for _, typ := range []webrtc.RTPCodecType{webrtc.RTPCodecTypeVideo, webrtc.RTPCodecTypeAudio} {
		if _, err := peerConnection.AddTransceiverFromKind(typ, webrtc.RTPTransceiverInit{
			Direction: webrtc.RTPTransceiverDirectionRecvonly,
		}); err != nil {
			log.Errorf("Failed to add transceiver: %v", err)
			http.Error(w, "Failed to setup transceivers", http.StatusInternalServerError)
			return
		}
	}

	// 7. Gắn các hàm callback (OnTrack, OnICECandidate...) cho PeerConnection
	setupPeerCallbacks(peer) // Logic nằm trong file `peer.go`

	// 8. Tạo SDP Offer (lời đề nghị kết nối)
	// Offer này sẽ mô tả 2 transceiver "Recvonly" mà chúng ta vừa thêm
	offer, err := peerConnection.CreateOffer(nil)
	if err != nil {
		log.Errorf("Failed to create offer: %v", err)
		http.Error(w, "Failed to create offer", http.StatusInternalServerError)
		return
	}

	// 9. Đặt Offer làm mô tả cục bộ (Local Description)
	// Bắt buộc phải làm điều này trước khi gửi Offer cho client
	if err = peerConnection.SetLocalDescription(offer); err != nil {
		log.Errorf("Failed to set local description: %v", err)
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}

	// 10. Chuẩn bị và gửi response về cho App Server
	resp := CreatePeerResponse{
		PeerID: peerID, // ID của peer vừa tạo
		Offer:  offer,  // SDP Offer để App Server gửi cho client
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)

	log.Infof("Created peer %s for room %s", peerID, req.RoomID)

	// 11. (TÙY CHỌN/NÂNG CAO) Trigger SignalPeerConnections
	// Khi peer này mới vào, có thể phòng đã có media của người khác.
	// Gọi hàm này để ngay lập tức đàm phán (re-negotiate) và gửi media
	// của người cũ cho peer mới này (nếu có).
	go room.SignalPeerConnections()
}

// setAnswerHandler xử lý POST /api/peer/{peerId}/answer
// Nhận SDP Answer từ client (do App Server chuyển tiếp)
func setAnswerHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Lấy peerId từ URL (ví dụ: /api/peer/abc-123/answer)
	peerID := chi.URLParam(r, "peerId")
	if peerID == "" {
		http.Error(w, "Missing peerId parameter", http.StatusBadRequest)
		return
	}

	// 2. Tìm PeerState tương ứng trong PeerManager
	peerManager.mu.RLock() // Dùng RLock (Read Lock) để đọc an toàn
	peer, exists := peerManager.peers[peerID]
	peerManager.mu.RUnlock()

	if !exists {
		http.Error(w, "Peer not found", http.StatusNotFound)
		return
	}

	// 3. Đọc và parse SDP Answer từ request body
	var req SetAnswerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Infof("Setting answer for peer %s", peerID)

	// 4. (QUAN TRỌNG) Đặt Answer làm mô tả từ xa (Remote Description)
	// Đây là bước hoàn tất quá trình "bắt tay" (handshake) SDP.
	// Sau bước này, PeerConnection mới biết cách client muốn gửi media.
	if err := peer.peerConnection.SetRemoteDescription(req.Answer); err != nil {
		log.Errorf("Failed to set remote description: %v", err)
		http.Error(w, "Failed to set answer", http.StatusInternalServerError)
		return
	}

	// 5. Trả về status 200 OK
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// addCandidateHandler xử lý POST /api/peer/{peerId}/candidate
// Nhận ICE Candidate từ client (do App Server chuyển tiếp)
func addCandidateHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Lấy peerId từ URL
	peerID := chi.URLParam(r, "peerId")
	if peerID == "" {
		http.Error(w, "Missing peerId parameter", http.StatusBadRequest)
		return
	}

	// 2. Tìm PeerState tương ứng
	peerManager.mu.RLock()
	peer, exists := peerManager.peers[peerID]
	peerManager.mu.RUnlock()

	if !exists {
		http.Error(w, "Peer not found", http.StatusNotFound)
		return
	}

	// 3. Đọc và parse ICE Candidate từ request body
	var req AddCandidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Infof("Adding ICE candidate for peer %s", peerID)

	// 4. (QUAN TRỌNG) Thêm ICE Candidate vào PeerConnection
	// Đây là các "địa chỉ" (IP, port) mà client gợi ý để SFU kết nối media.
	// PeerConnection sẽ tự động thử kết nối đến các địa chỉ này.
	if err := peer.peerConnection.AddICECandidate(req.Candidate); err != nil {
		log.Errorf("Failed to add ICE candidate: %v", err)
		http.Error(w, "Failed to add candidate", http.StatusInternalServerError)
		return
	}

	// 5. Trả về status 200 OK
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// deletePeerHandler xử lý DELETE /api/peer/{peerId}
// Khi client chủ động rời phòng, chỉ cần đóng kết nối WebRTC.
// Phần cleanup (xóa peer, dọn room, gửi webhook...) sẽ được callback OnConnectionStateChange xử lý.
func deletePeerHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Lấy peerId từ URL
	peerID := chi.URLParam(r, "peerId")
	if peerID == "" {
		http.Error(w, "Missing peerId parameter", http.StatusBadRequest)
		return
	}

	// 2. Tìm peer trong PeerManager
	peerManager.mu.RLock()
	peer, exists := peerManager.peers[peerID]
	peerManager.mu.RUnlock()

	if !exists {
		http.Error(w, "Peer not found", http.StatusNotFound)
		return
	}

	log.Infof("Peer %s requested to disconnect from room %s", peerID, peer.roomID)

	// 3. Đóng kết nối WebRTC
	// Khi pc.Close() được gọi, callback OnConnectionStateChange(Closed) sẽ tự động:
	// - Remove peer khỏi room
	// - Xóa peer khỏi peerManager
	// - Cleanup room
	peer.closedByServer = true
	peer.peerConnection.Close()

	// 4. Trả về phản hồi OK
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// healthCheckHandler xử lý GET /health
// Endpoint đơn giản để kiểm tra xem server còn "sống" hay không
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"healthy"}`)
	// log.Infof("healthy") // Có thể bỏ log này để đỡ "nhiễu" log khi bị check liên tục
}
