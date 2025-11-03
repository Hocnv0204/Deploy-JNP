// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
)

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
