// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

package main

import (
	"io"
	"sync"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

// PeerState quản lý trạng thái của một peer connection
type PeerState struct {
	id             string
	roomID         string
	peerConnection *webrtc.PeerConnection
	webhookURL     string
	room           *Room
	closedByServer bool
}

// PeerManager quản lý tất cả peers
type PeerManager struct {
	mu    sync.RWMutex
	peers map[string]*PeerState // map[peerID]*PeerState
}

var peerManager = &PeerManager{
	peers: make(map[string]*PeerState),
}

// setupPeerCallbacks thiết lập các callback cho PeerConnection
func setupPeerCallbacks(peer *PeerState) {
	pc := peer.peerConnection

	// ICE Candidate callback
	pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			return
		}

		log.Infof("Find new ICE of SFU, need to send to peer: %s", peer.id)
		go sendWebhook(peer, "candidate", candidate.ToJSON())
	})

	// Connection state callback
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Infof("Peer %s: Connection state = %s", peer.id, state)

		switch state {
		case webrtc.PeerConnectionStateFailed:
			pc.Close()
		case webrtc.PeerConnectionStateClosed:
			if peer.closedByServer {
				log.Infof("Peer %s closed by App Server, skip webhook", peer.id)
			} else {
				go sendWebhook(peer, "peer_disconnected", nil)
			}

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
