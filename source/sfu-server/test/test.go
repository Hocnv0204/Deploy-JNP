// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

//go:build !js
// +build !js

// sfu-media-server là một SFU Server chuyên dụng (Media Server),
// cung cấp REST API nội bộ để App Server điều khiển.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pion/logging"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

var (
	addr = flag.String("addr", ":8080", "http service address")
	log  = logging.NewDefaultLoggerFactory().NewLogger("sfu-media")
)

// API Request/Response Models
type CreatePeerRequest struct {
	RoomID     string `json:"roomId"`
	WebhookURL string `json:"webhookUrl"` // URL để callback về App Server
}

type CreatePeerResponse struct {
	PeerID string                    `json:"peerId"`
	Offer  webrtc.SessionDescription `json:"offer"`
}

type SetAnswerRequest struct {
	Answer webrtc.SessionDescription `json:"answer"`
}

type AddCandidateRequest struct {
	Candidate webrtc.ICECandidateInit `json:"candidate"`
}

type WebhookEvent struct {
	PeerID string `json:"peerId"`
	RoomID string `json:"roomId"`
	Event  string `json:"event"` // "candidate" | "offer"
	Data   string `json:"data"`
}

// PeerState quản lý trạng thái của một peer connection
type PeerState struct {
	id             string
	roomID         string
	peerConnection *webrtc.PeerConnection
	webhookURL     string
	room           *Room
}

// Room đại diện cho một phòng họp riêng biệt
type Room struct {
	id          string
	mu          sync.RWMutex
	peers       map[string]*PeerState // map[peerID]*PeerState
	trackLocals map[string]*webrtc.TrackLocalStaticRTP
}

// RoomManager quản lý tất cả các phòng họp
type RoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

// PeerManager quản lý tất cả peers
type PeerManager struct {
	mu    sync.RWMutex
	peers map[string]*PeerState // map[peerID]*PeerState
}

var (
	roomManager = &RoomManager{rooms: make(map[string]*Room)}
	peerManager = &PeerManager{peers: make(map[string]*PeerState)}
)

// GetOrCreateRoom lấy hoặc tạo mới một phòng
func (rm *RoomManager) GetOrCreateRoom(roomID string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	room, exists := rm.rooms[roomID]
	if !exists {
		log.Infof("Creating new room: %s", roomID)
		room = &Room{
			id:          roomID,
			peers:       make(map[string]*PeerState),
			trackLocals: make(map[string]*webrtc.TrackLocalStaticRTP),
		}
		rm.rooms[roomID] = room
	}
	return room
}

// CleanupRoom xóa phòng nếu không còn peer nào
func (rm *RoomManager) CleanupRoom(roomID string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, exists := rm.rooms[roomID]; exists {
		room.mu.RLock()
		isEmpty := len(room.peers) == 0
		room.mu.RUnlock()

		if isEmpty {
			log.Infof("Cleaning up empty room: %s", roomID)
			delete(rm.rooms, roomID)
		}
	}
}

// AddPeer thêm peer vào room
func (r *Room) AddPeer(peer *PeerState) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.peers[peer.id] = peer
	log.Infof("Room %s: Added peer %s. Total peers: %d", r.id, peer.id, len(r.peers))
}

// RemovePeer xóa peer khỏi room
func (r *Room) RemovePeer(peerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.peers, peerID)
	log.Infof("Room %s: Removed peer %s. Remaining peers: %d", r.id, peerID, len(r.peers))
}

// AddTrack thêm track vào phòng
func (r *Room) AddTrack(t *webrtc.TrackRemote) *webrtc.TrackLocalStaticRTP {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.SignalPeerConnections()
	}()

	trackLocal, err := webrtc.NewTrackLocalStaticRTP(
		t.Codec().RTPCodecCapability,
		t.ID(),
		t.StreamID(),
	)
	if err != nil {
		log.Errorf("Failed to create track local: %v", err)
		return nil
	}

	r.trackLocals[t.ID()] = trackLocal
	log.Infof("Room %s: Added track ID=%s", r.id, t.ID())

	return trackLocal
}

// RemoveTrack xóa track khỏi phòng
func (r *Room) RemoveTrack(t *webrtc.TrackLocalStaticRTP) {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.SignalPeerConnections()
	}()

	delete(r.trackLocals, t.ID())
	log.Infof("Room %s: Removed track ID=%s", r.id, t.ID())
}

// SignalPeerConnections đồng bộ tracks cho tất cả peers trong phòng
func (r *Room) SignalPeerConnections() {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.DispatchKeyFrame()
	}()

	attemptSync := func() bool {
		for _, peer := range r.peers {
			pc := peer.peerConnection

			if pc.ConnectionState() == webrtc.PeerConnectionStateClosed {
				delete(r.peers, peer.id)
				return true
			}

			existingSenders := map[string]bool{}

			// Check existing senders
			for _, sender := range pc.GetSenders() {
				if sender.Track() == nil {
					continue
				}
				existingSenders[sender.Track().ID()] = true

				if _, ok := r.trackLocals[sender.Track().ID()]; !ok {
					if err := pc.RemoveTrack(sender); err != nil {
						return true
					}
				}
			}

			// Mark receivers to avoid loopback
			for _, receiver := range pc.GetReceivers() {
				if receiver.Track() == nil {
					continue
				}
				existingSenders[receiver.Track().ID()] = true
			}

			// Add missing tracks
			for trackID := range r.trackLocals {
				if !existingSenders[trackID] {
					if _, err := pc.AddTrack(r.trackLocals[trackID]); err != nil {
						return true
					}
				}
			}

			// Create and send new offer
			offer, err := pc.CreateOffer(nil)
			if err != nil {
				return true
			}

			if err = pc.SetLocalDescription(offer); err != nil {
				return true
			}

			// Send offer via webhook
			go sendWebhook(peer, "offer", offer)
		}

		return false
	}

	for syncAttempt := 0; syncAttempt < 25; syncAttempt++ {
		if !attemptSync() {
			break
		}
	}
}

// DispatchKeyFrame gửi keyframe request đến tất cả peers
func (r *Room) DispatchKeyFrame() {
	for _, peer := range r.peers {
		for _, receiver := range peer.peerConnection.GetReceivers() {
			if receiver.Track() == nil {
				continue
			}

			_ = peer.peerConnection.WriteRTCP([]rtcp.Packet{
				&rtcp.PictureLossIndication{
					MediaSSRC: uint32(receiver.Track().SSRC()),
				},
			})
		}
	}
}

// sendWebhook gửi event về App Server
func sendWebhook(peer *PeerState, event string, data interface{}) {
	if peer.webhookURL == "" {
		return
	}

	dataJSON, err := json.Marshal(data)
	if err != nil {
		log.Errorf("Failed to marshal webhook data: %v", err)
		return
	}

	webhook := WebhookEvent{
		PeerID: peer.id,
		RoomID: peer.roomID,
		Event:  event,
		Data:   string(dataJSON),
	}

	body, err := json.Marshal(webhook)
	if err != nil {
		log.Errorf("Failed to marshal webhook: %v", err)
		return
	}

	resp, err := http.Post(peer.webhookURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Errorf("Failed to send webhook to %s: %v", peer.webhookURL, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Warnf("Webhook returned error status %d for peer %s", resp.StatusCode, peer.id)
	} else {
		log.Infof("Webhook sent successfully to %s for peer %s, event: %s", peer.webhookURL, peer.id, event)
	}
}

// API Handlers

// POST /api/peer/create
// Tạo PeerConnection mới và trả về SDP Offer
func createPeerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

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

// POST /api/peer/{peerId}/answer
// Nhận SDP Answer từ client
func setAnswerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	peerID := r.URL.Path[len("/api/peer/"):]
	if idx := len(peerID) - len("/answer"); idx > 0 {
		peerID = peerID[:idx]
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

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// POST /api/peer/{peerId}/candidate
// Nhận ICE Candidate từ client
func addCandidateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	peerID := r.URL.Path[len("/api/peer/"):]
	if idx := len(peerID) - len("/candidate"); idx > 0 {
		peerID = peerID[:idx]
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

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// DELETE /api/peer/{peerId}
// Xóa peer connection
func deletePeerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	peerID := r.URL.Path[len("/api/peer/"):]

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

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

// setupPeerCallbacks thiết lập các callback cho PeerConnection
func setupPeerCallbacks(peer *PeerState) {
	pc := peer.peerConnection

	// ICE Candidate callback
	pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			return
		}

		log.Infof("Peer %s: New ICE candidate", peer.id)
		go sendWebhook(peer, "candidate", candidate.ToJSON())
	})

	// Connection state callback
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Infof("Peer %s: Connection state = %s", peer.id, state)

		switch state {
		case webrtc.PeerConnectionStateFailed:
			pc.Close()
		case webrtc.PeerConnectionStateClosed:
			peer.room.RemovePeer(peer.id)
			peerManager.mu.Lock()
			delete(peerManager.peers, peer.id)
			peerManager.mu.Unlock()
			roomManager.CleanupRoom(peer.roomID)
		}
	})

	// ICE Connection state callback
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Infof("Peer %s: ICE connection state = %s", peer.id, state)
	})

	// Track callback - xử lý incoming media
	pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Infof("Peer %s: New track - Kind=%s, ID=%s", peer.id, track.Kind(), track.ID())

		trackLocal := peer.room.AddTrack(track)
		if trackLocal == nil {
			return
		}
		defer peer.room.RemoveTrack(trackLocal)

		buf := make([]byte, 1500)
		rtpPkt := &rtp.Packet{}

		for {
			n, _, err := track.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Errorf("Peer %s: Track read error: %v", peer.id, err)
				}
				return
			}

			if err = rtpPkt.Unmarshal(buf[:n]); err != nil {
				log.Errorf("Peer %s: Failed to unmarshal RTP: %v", peer.id, err)
				return
			}

			// Strip extensions
			rtpPkt.Extension = false
			rtpPkt.Extensions = nil

			if err = trackLocal.WriteRTP(rtpPkt); err != nil {
				if err != io.EOF {
					log.Errorf("Peer %s: Track write error: %v", peer.id, err)
				}
				return
			}
		}
	})
}

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
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"healthy"}`)
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
