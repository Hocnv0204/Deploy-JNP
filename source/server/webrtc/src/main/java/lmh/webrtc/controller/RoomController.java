package lmh.webrtc.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lmh.webrtc.dto.ClientMessage;
import lmh.webrtc.dto.PeerStateDto;
import lmh.webrtc.dto.RoomStateResponse;
import lmh.webrtc.dto.SimpleStatusResponse;
import lmh.webrtc.dto.UpdatePeerStateRequest;
import lmh.webrtc.service.RoomStateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/room")
public class RoomController {

    private final RoomStateService roomStateService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping("/{roomId}/state")
    public ResponseEntity<RoomStateResponse> getRoomState(@PathVariable String roomId) {
        return ResponseEntity.ok(roomStateService.getRoomState(roomId));
    }

    @PostMapping("/{roomId}/peer/{peerId}/state")
    public ResponseEntity<SimpleStatusResponse> updatePeerState(
            @PathVariable String roomId,
            @PathVariable String peerId,
            @RequestBody UpdatePeerStateRequest body
    ) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();

        PeerStateDto updated = roomStateService.upsertPeerState(
                roomId,
                peerId,
                username,
                body.getMic(),
                body.getCam()
        );

        ObjectNode dataNode = objectMapper.valueToTree(updated);
        ClientMessage message = ClientMessage.builder()
                .event("peer_updated")
                .data(dataNode)
                .build();

        String destination = "/topic/rooms/" + roomId;
        messagingTemplate.convertAndSend(destination, message);

        return ResponseEntity.ok(SimpleStatusResponse.builder().status("ok").build());
    }
}


