// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

//go:build !js
// +build !js

// sfu-ws là một SFU (Selective Forwarding Unit) đa phòng (multi-room),
// hỗ trợ nhiều-đến-nhiều (many-to-many) sử dụng WebSocket để truyền tín hiệu (signaling).
package main

import (
	"encoding/json"
	"flag"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/logging"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

var (
	addr     = flag.String("addr", ":8080", "http service address")
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	log = logging.NewDefaultLoggerFactory().NewLogger("sfu-ws")
)

type websocketMessage struct {
	Event string `json:"event"`
	Data  string `json:"data"`
}

type peerConnectionState struct {
	peerConnection *webrtc.PeerConnection
	websocket      *threadSafeWriter
}

// Room đại diện cho một phòng họp riêng biệt
type Room struct {
	id              string
	mu              sync.RWMutex
	peerConnections []peerConnectionState
	trackLocals     map[string]*webrtc.TrackLocalStaticRTP
}

// RoomManager quản lý tất cả các phòng họp
type RoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

var roomManager = &RoomManager{
	rooms: make(map[string]*Room),
}

// GetOrCreateRoom lấy hoặc tạo mới một phòng
func (rm *RoomManager) GetOrCreateRoom(roomID string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	room, exists := rm.rooms[roomID]
	if !exists {
		log.Infof("Creating new room: %s", roomID)
		room = &Room{
			id:              roomID,
			peerConnections: make([]peerConnectionState, 0),
			trackLocals:     make(map[string]*webrtc.TrackLocalStaticRTP),
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
		isEmpty := len(room.peerConnections) == 0
		room.mu.RUnlock()

		if isEmpty {
			log.Infof("Cleaning up empty room: %s", roomID)
			delete(rm.rooms, roomID)
		}
	}
}

// AddTrack thêm track vào phòng và trigger renegotiation
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
	log.Infof("Added track to room %s: ID=%s", r.id, t.ID())

	return trackLocal
}

// RemoveTrack xóa track khỏi phòng và trigger renegotiation
func (r *Room) RemoveTrack(t *webrtc.TrackLocalStaticRTP) {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.SignalPeerConnections()
	}()

	delete(r.trackLocals, t.ID())
	log.Infof("Removed track from room %s: ID=%s", r.id, t.ID())
}

// SignalPeerConnections đồng bộ tracks cho tất cả peer connections trong phòng
func (r *Room) SignalPeerConnections() {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.DispatchKeyFrame()
	}()

	attemptSync := func() (tryAgain bool) {
		for i := range r.peerConnections {
			if r.peerConnections[i].peerConnection.ConnectionState() == webrtc.PeerConnectionStateClosed {
				r.peerConnections = append(r.peerConnections[:i], r.peerConnections[i+1:]...)
				return true
			}

			existingSenders := map[string]bool{}

			for _, sender := range r.peerConnections[i].peerConnection.GetSenders() {
				if sender.Track() == nil {
					continue
				}

				existingSenders[sender.Track().ID()] = true

				if _, ok := r.trackLocals[sender.Track().ID()]; !ok {
					if err := r.peerConnections[i].peerConnection.RemoveTrack(sender); err != nil {
						return true
					}
				}
			}

			for _, receiver := range r.peerConnections[i].peerConnection.GetReceivers() {
				if receiver.Track() == nil {
					continue
				}
				existingSenders[receiver.Track().ID()] = true
			}

			for trackID := range r.trackLocals {
				if _, ok := existingSenders[trackID]; !ok {
					if _, err := r.peerConnections[i].peerConnection.AddTrack(r.trackLocals[trackID]); err != nil {
						return true
					}
				}
			}

			offer, err := r.peerConnections[i].peerConnection.CreateOffer(nil)
			if err != nil {
				return true
			}

			if err = r.peerConnections[i].peerConnection.SetLocalDescription(offer); err != nil {
				return true
			}

			offerString, err := json.Marshal(offer)
			if err != nil {
				log.Errorf("Failed to marshal offer: %v", err)
				return true
			}

			log.Infof("Sending offer to peer in room %s", r.id)

			if err = r.peerConnections[i].websocket.WriteJSON(&websocketMessage{
				Event: "offer",
				Data:  string(offerString),
			}); err != nil {
				return true
			}
		}

		return false
	}

	for syncAttempt := 0; syncAttempt < 25; syncAttempt++ {
		if !attemptSync() {
			break
		}
	}
}

// DispatchKeyFrame gửi keyframe request đến tất cả peers trong phòng
func (r *Room) DispatchKeyFrame() {
	for i := range r.peerConnections {
		for _, receiver := range r.peerConnections[i].peerConnection.GetReceivers() {
			if receiver.Track() == nil {
				continue
			}

			_ = r.peerConnections[i].peerConnection.WriteRTCP([]rtcp.Packet{
				&rtcp.PictureLossIndication{
					MediaSSRC: uint32(receiver.Track().SSRC()),
				},
			})
		}
	}
}

// AddPeerConnection thêm peer connection vào phòng
func (r *Room) AddPeerConnection(pc peerConnectionState) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.peerConnections = append(r.peerConnections, pc)
	log.Infof("Added peer to room %s. Total peers: %d", r.id, len(r.peerConnections))
}

func main() {
	flag.Parse()

	// WebSocket handler với room ID từ query parameter
	http.HandleFunc("/websocket", websocketHandler)

	// Định kỳ gửi keyframe cho tất cả các phòng
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

	log.Infof("SFU Server starting on %s", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Errorf("Failed to start server: %v", err)
	}
}

// websocketHandler xử lý WebSocket connections với room isolation
func websocketHandler(w http.ResponseWriter, r *http.Request) {
	// Lấy room ID từ query parameter
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		log.Errorf("Missing room parameter")
		http.Error(w, "Missing room parameter", http.StatusBadRequest)
		return
	}

	log.Infof("New connection request for room: %s", roomID)

	// Upgrade to WebSocket
	unsafeConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Errorf("Failed to upgrade to WebSocket: %v", err)
		return
	}

	c := &threadSafeWriter{unsafeConn, sync.Mutex{}}
	defer c.Close()

	// Lấy hoặc tạo phòng
	room := roomManager.GetOrCreateRoom(roomID)

	// Tạo PeerConnection
	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		log.Errorf("Failed to create PeerConnection: %v", err)
		return
	}
	defer peerConnection.Close()

	// Thêm transceivers cho audio và video
	for _, typ := range []webrtc.RTPCodecType{webrtc.RTPCodecTypeVideo, webrtc.RTPCodecTypeAudio} {
		if _, err := peerConnection.AddTransceiverFromKind(typ, webrtc.RTPTransceiverInit{
			Direction: webrtc.RTPTransceiverDirectionRecvonly,
		}); err != nil {
			log.Errorf("Failed to add transceiver: %v", err)
			return
		}
	}

	// Thêm peer vào phòng
	room.AddPeerConnection(peerConnectionState{peerConnection, c})

	// Trickle ICE
	peerConnection.OnICECandidate(func(i *webrtc.ICECandidate) {
		if i == nil {
			return
		}

		candidateString, err := json.Marshal(i.ToJSON())
		if err != nil {
			log.Errorf("Failed to marshal candidate: %v", err)
			return
		}

		log.Infof("Sending ICE candidate to peer in room %s", roomID)

		if err := c.WriteJSON(&websocketMessage{
			Event: "candidate",
			Data:  string(candidateString),
		}); err != nil {
			log.Errorf("Failed to send candidate: %v", err)
		}
	})

	// Connection state changes
	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Infof("Room %s - Connection state: %s", roomID, state)

		switch state {
		case webrtc.PeerConnectionStateFailed:
			if err := peerConnection.Close(); err != nil {
				log.Errorf("Failed to close PeerConnection: %v", err)
			}
		case webrtc.PeerConnectionStateClosed:
			room.SignalPeerConnections()
			roomManager.CleanupRoom(roomID)
		}
	})

	// Xử lý incoming tracks
	peerConnection.OnTrack(func(t *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		log.Infof("Room %s - New track: Kind=%s, ID=%s", roomID, t.Kind(), t.ID())

		trackLocal := room.AddTrack(t)
		if trackLocal == nil {
			return
		}
		defer room.RemoveTrack(trackLocal)

		buf := make([]byte, 1500)
		rtpPkt := &rtp.Packet{}

		for {
			i, _, err := t.Read(buf)
			if err != nil {
				return
			}

			if err = rtpPkt.Unmarshal(buf[:i]); err != nil {
				log.Errorf("Failed to unmarshal RTP: %v", err)
				return
			}

			rtpPkt.Extension = false
			rtpPkt.Extensions = nil

			if err = trackLocal.WriteRTP(rtpPkt); err != nil {
				return
			}
		}
	})

	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Infof("Room %s - ICE state: %s", roomID, state)
	})

	// Signal cho peer mới
	room.SignalPeerConnections()

	// Xử lý WebSocket messages
	message := &websocketMessage{}
	for {
		_, raw, err := c.ReadMessage()
		if err != nil {
			log.Errorf("Room %s - Failed to read message: %v", roomID, err)
			return
		}

		if err := json.Unmarshal(raw, &message); err != nil {
			log.Errorf("Room %s - Failed to unmarshal message: %v", roomID, err)
			return
		}

		switch message.Event {
		case "candidate":
			candidate := webrtc.ICECandidateInit{}
			if err := json.Unmarshal([]byte(message.Data), &candidate); err != nil {
				log.Errorf("Failed to unmarshal candidate: %v", err)
				return
			}

			log.Infof("Room %s - Received ICE candidate", roomID)

			if err := peerConnection.AddICECandidate(candidate); err != nil {
				log.Errorf("Failed to add ICE candidate: %v", err)
				return
			}

		case "answer":
			answer := webrtc.SessionDescription{}
			if err := json.Unmarshal([]byte(message.Data), &answer); err != nil {
				log.Errorf("Failed to unmarshal answer: %v", err)
				return
			}

			log.Infof("Room %s - Received answer", roomID)

			if err := peerConnection.SetRemoteDescription(answer); err != nil {
				log.Errorf("Failed to set remote description: %v", err)
				return
			}

		default:
			log.Errorf("Room %s - Unknown message event: %s", roomID, message.Event)
		}
	}
}

// threadSafeWriter wrapper cho Gorilla WebSocket
type threadSafeWriter struct {
	*websocket.Conn
	sync.Mutex
}

func (t *threadSafeWriter) WriteJSON(v any) error {
	t.Lock()
	defer t.Unlock()
	return t.Conn.WriteJSON(v)
}
