// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

package main

import (
	"sync"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

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
