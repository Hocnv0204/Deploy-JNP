package lmh.webrtc.controller;

import lmh.webrtc.dto.WebhookEvent;
import lmh.webrtc.service.WebhookService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping({"/webhook", "/sfu-webhook"})
public class WebhookController {

    private final WebhookService webhookService;

    @PostMapping
    public ResponseEntity<String> handleWebhook(@RequestBody WebhookEvent body) {
        String result = webhookService.processWebhook(body);
        return ResponseEntity.ok(result);
    }
}


