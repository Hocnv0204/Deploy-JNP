// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

package main

import "github.com/pion/webrtc/v4"

// CreatePeerRequest là request để tạo peer connection mới
type CreatePeerRequest struct {
	RoomID     string `json:"roomId"`
	WebhookURL string `json:"webhookUrl"` // URL để callback về App Server
}

// CreatePeerResponse là response khi tạo peer thành công
type CreatePeerResponse struct {
	PeerID string                    `json:"peerId"`
	Offer  webrtc.SessionDescription `json:"offer"`
}

// SetAnswerRequest là request để set SDP answer
type SetAnswerRequest struct {
	Answer webrtc.SessionDescription `json:"answer"`
}

// AddCandidateRequest là request để thêm ICE candidate
type AddCandidateRequest struct {
	Candidate webrtc.ICECandidateInit `json:"candidate"`
}

// WebhookEvent là payload gửi về App Server qua webhook
type WebhookEvent struct {
	PeerID string `json:"peerId"`
	RoomID string `json:"roomId"`
	Event  string `json:"event"` // "candidate" | "offer"
	Data   string `json:"data"`
}
