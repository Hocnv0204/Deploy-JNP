// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/pion/webrtc/v4"
)

// createPeerHandler xử lý POST /api/peer/create
// Tạo PeerConnection mới và trả về SDP Offer
func createPeerHandler(w http.ResponseWriter, r *http.Request) {
	var req CreatePeerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.RoomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	log.Infof("Creating peer for room: %s", req.RoomID)

	// Tạo PeerConnection
	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		log.Errorf("Failed to create PeerConnection: %v", err)
		http.Error(w, "Failed to create peer connection", http.StatusInternalServerError)
		return
	}

	// Tạo peer state
	peerID := uuid.New().String()
	room := roomManager.GetOrCreateRoom(req.RoomID)

	peer := &PeerState{
		id:             peerID,
		roomID:         req.RoomID,
		peerConnection: peerConnection,
		webhookURL:     req.WebhookURL,
		room:           room,
	}

	// Lưu peer
	peerManager.mu.Lock()
	peerManager.peers[peerID] = peer
	peerManager.mu.Unlock()

	room.AddPeer(peer)

	// Setup transceivers
	for _, typ := range []webrtc.RTPCodecType{webrtc.RTPCodecTypeVideo, webrtc.RTPCodecTypeAudio} {
		if _, err := peerConnection.AddTransceiverFromKind(typ, webrtc.RTPTransceiverInit{
			Direction: webrtc.RTPTransceiverDirectionRecvonly,
		}); err != nil {
			log.Errorf("Failed to add transceiver: %v", err)
			http.Error(w, "Failed to setup transceivers", http.StatusInternalServerError)
			return
		}
	}

	// Setup callbacks
	setupPeerCallbacks(peer)

	// Tạo offer
	offer, err := peerConnection.CreateOffer(nil)
	if err != nil {
		log.Errorf("Failed to create offer: %v", err)
		http.Error(w, "Failed to create offer", http.StatusInternalServerError)
		return
	}

	if err = peerConnection.SetLocalDescription(offer); err != nil {
		log.Errorf("Failed to set local description: %v", err)
		http.Error(w, "Failed to set local description", http.StatusInternalServerError)
		return
	}

	// Trả về response
	resp := CreatePeerResponse{
		PeerID: peerID,
		Offer:  offer,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)

	log.Infof("Created peer %s for room %s", peerID, req.RoomID)

	// Trigger signaling cho các peer khác
	go room.SignalPeerConnections()
}

// setAnswerHandler xử lý POST /api/peer/{peerId}/answer
// Nhận SDP Answer từ client
func setAnswerHandler(w http.ResponseWriter, r *http.Request) {
	peerID := chi.URLParam(r, "peerId")
	if peerID == "" {
		http.Error(w, "Missing peerId parameter", http.StatusBadRequest)
		return
	}

	peerManager.mu.RLock()
	peer, exists := peerManager.peers[peerID]
	peerManager.mu.RUnlock()

	if !exists {
		http.Error(w, "Peer not found", http.StatusNotFound)
		return
	}

	var req SetAnswerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Infof("Setting answer for peer %s", peerID)

	if err := peer.peerConnection.SetRemoteDescription(req.Answer); err != nil {
		log.Errorf("Failed to set remote description: %v", err)
		http.Error(w, "Failed to set answer", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// addCandidateHandler xử lý POST /api/peer/{peerId}/candidate
// Nhận ICE Candidate từ client
func addCandidateHandler(w http.ResponseWriter, r *http.Request) {
	peerID := chi.URLParam(r, "peerId")
	if peerID == "" {
		http.Error(w, "Missing peerId parameter", http.StatusBadRequest)
		return
	}

	peerManager.mu.RLock()
	peer, exists := peerManager.peers[peerID]
	peerManager.mu.RUnlock()

	if !exists {
		http.Error(w, "Peer not found", http.StatusNotFound)
		return
	}

	var req AddCandidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Infof("Adding ICE candidate for peer %s", peerID)

	if err := peer.peerConnection.AddICECandidate(req.Candidate); err != nil {
		log.Errorf("Failed to add ICE candidate: %v", err)
		http.Error(w, "Failed to add candidate", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// deletePeerHandler xử lý DELETE /api/peer/{peerId}
// Xóa peer connection
func deletePeerHandler(w http.ResponseWriter, r *http.Request) {
	peerID := chi.URLParam(r, "peerId")
	if peerID == "" {
		http.Error(w, "Missing peerId parameter", http.StatusBadRequest)
		return
	}

	peerManager.mu.Lock()
	peer, exists := peerManager.peers[peerID]
	if exists {
		delete(peerManager.peers, peerID)
	}
	peerManager.mu.Unlock()

	if !exists {
		http.Error(w, "Peer not found", http.StatusNotFound)
		return
	}

	log.Infof("Deleting peer %s from room %s", peerID, peer.roomID)

	peer.peerConnection.Close()
	peer.room.RemovePeer(peerID)
	roomManager.CleanupRoom(peer.roomID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// healthCheckHandler xử lý GET /health
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"healthy"}`)
}
