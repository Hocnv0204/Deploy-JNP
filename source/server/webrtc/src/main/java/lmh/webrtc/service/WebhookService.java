package lmh.webrtc.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lmh.webrtc.dto.ClientMessage;
import lmh.webrtc.dto.WebhookEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookService {

    private final SimpMessagingTemplate messagingTemplate;
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
            default -> {
                log.debug("Ignoring unknown event from SFU: {}", event);
                return "OK, unknown event";
            }
        }

        try {
            JsonNode parsedData = objectMapper.readTree(rawData);

            ClientMessage message = ClientMessage.builder()
                    .event(clientEvent)
                    .data(parsedData)
                    .build();

            String destination = "/queue/peers/" + peerId;
            messagingTemplate.convertAndSend(destination, message);

            return "OK";
        } catch (Exception e) {
            log.warn("Failed to parse SFU data for event {}: {}", event, e.getMessage());
            return "OK, data parse error";
        }
    }
}


