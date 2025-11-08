package lmh.webrtc.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lmh.webrtc.dto.ClientMessage;
import lmh.webrtc.dto.PeerStateDto;
import lmh.webrtc.dto.WebhookEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Collection;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookService {

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomStateService roomStateService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String processWebhook(WebhookEvent webhookEvent) {
        if (webhookEvent == null) {
            return "OK, empty body";
        }

        final String peerId = webhookEvent.getPeerId();
        final String event = webhookEvent.getEvent();
        final String rawData = webhookEvent.getData();

        if (peerId == null || event == null || rawData == null) {
            return "OK, invalid payload";
        }

        final String clientEvent;
        switch (event) {
            case "candidate" -> clientEvent = "sfu-candidate";
            case "offer" -> clientEvent = "sfu-offer";
            case "peer_disconnected" -> clientEvent = "peer_disconnected";
            default -> {
                log.debug("Ignoring unknown event from SFU: {}", event);
                return "OK, unknown event";
            }
        }

        try {
            JsonNode parsedData = objectMapper.readTree(rawData);

            if ("peer_disconnected".equals(clientEvent)) {
                // For disconnection, broadcast to the room topic and cleanup state
                String roomId = webhookEvent.getRoomId();
                if (roomId != null) {
                    roomStateService.removePeer(roomId, peerId);
                    ObjectNode dataNode = objectMapper.createObjectNode();
                    dataNode.put("peerId", peerId);
                    dataNode.put("roomId", roomId);
                    ClientMessage message = ClientMessage.builder()
                            .event("peer_disconnected")
                            .data(dataNode)
                            .build();
                    messagingTemplate.convertAndSend("/topic/rooms/" + roomId, message);
                }
            } else if ("sfu-offer".equals(clientEvent)) {
                // ✅ XỬ LÝ RIÊNG CHO OFFER - THÊM SOURCE PEER INFO
                handleOfferEvent(peerId, parsedData);
            } else {
                // ✅ XỬ LÝ BÌNH THƯỜNG CHO CANDIDATE VÀ CÁC EVENT KHÁC
                ClientMessage message = ClientMessage.builder()
                        .event(clientEvent)
                        .data(parsedData)
                        .build();
                String destination = "/queue/peers/" + peerId;
                messagingTemplate.convertAndSend(destination, message);
            }

            return "OK";
        } catch (Exception e) {
            log.warn("Failed to parse SFU data for event {}: {}", event, e.getMessage());
            return "OK, data parse error";
        }
    }

    /**
     * ✅ Xử lý offer event với source peer information
     */
    private void handleOfferEvent(String targetPeerId, JsonNode parsedData) {
        try {
            // Lấy thông tin target peer
            String targetUsername = roomStateService.getUsername(targetPeerId);
            String roomId = roomStateService.getRoomId(targetPeerId);

            log.info("Processing offer for target peer: peerId={}, username={}, roomId={}",
                    targetPeerId, targetUsername, roomId);

            // Tìm source peers (những peer khác trong cùng room)
            String sourcePeerId = null;
            String sourceUsername = null;

            if (roomId != null) {
                Collection<PeerStateDto> otherPeers = roomStateService.getOtherPeersInRoom(roomId, targetPeerId);

                if (!otherPeers.isEmpty()) {
                    // Lấy peer đầu tiên (hoặc có thể implement logic phức tạp hơn)
                    PeerStateDto sourcePeer = otherPeers.iterator().next();
                    sourcePeerId = sourcePeer.getPeerId();
                    sourceUsername = sourcePeer.getUsername();

                    log.info("Found source peer: peerId={}, username={}", sourcePeerId, sourceUsername);
                } else {
                    log.warn("No other peers found in room {} for target peer {}", roomId, targetPeerId);
                }
            } else {
                log.warn("Could not find room for peer {}", targetPeerId);
            }

            // ✅ Tạo enhanced data node với source peer info
            ObjectNode enhancedData;
            if (parsedData.isObject()) {
                enhancedData = (ObjectNode) parsedData.deepCopy();
            } else {
                enhancedData = objectMapper.createObjectNode();
                enhancedData.set("originalData", parsedData);
            }

            // ✅ THÊM source peer info
            if (sourcePeerId != null) {
                enhancedData.put("sourcePeerId", sourcePeerId);
                log.info("Added sourcePeerId to offer: {}", sourcePeerId);
            }
            if (sourceUsername != null) {
                enhancedData.put("sourceUsername", sourceUsername);
                log.info("Added sourceUsername to offer: {}", sourceUsername);
            }

            // Gửi message qua STOMP
            ClientMessage message = ClientMessage.builder()
                    .event("sfu-offer")
                    .data(enhancedData)
                    .build();

            String destination = "/queue/peers/" + targetPeerId;
            messagingTemplate.convertAndSend(destination, message);

            log.info("✅ Sent offer with source info to {}", destination);

        } catch (Exception e) {
            log.error("Error handling offer event for peer {}: {}", targetPeerId, e.getMessage(), e);
        }
    }
}