package lmh.webrtc.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Slf4j
@Controller
@RequiredArgsConstructor
public class TestWebsocketController {

    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/hello")
    public void receiveMessage(@Payload String message) {
        log.info("💬 Received: {}", message);

        messagingTemplate.convertAndSend("/topic/greetings", "Server received: " + message);
    }
}
