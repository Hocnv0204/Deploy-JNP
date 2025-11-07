package lmh.webrtc.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lmh.webrtc.dto.AddCandidateRequest;
import lmh.webrtc.dto.ClientMessage;
import lmh.webrtc.dto.CreatePeerRequest;
import lmh.webrtc.dto.CreatePeerResponse;
import lmh.webrtc.dto.PeerStateDto;
import lmh.webrtc.dto.SetAnswerRequest;
import lmh.webrtc.dto.SimpleStatusResponse;
import lmh.webrtc.service.RoomStateService;
import lmh.webrtc.service.SfuClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/peer")
public class PeerController {

    private final SfuClient sfuClient;
    private final RoomStateService roomStateService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/create")
    public ResponseEntity<CreatePeerResponse> createPeer(@RequestBody CreatePeerRequest request) {
        CreatePeerResponse response = sfuClient.createPeer(request);
        String username = org.springframework.security.core.context.SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getName();
        response.setUsername(username);

        // Initialize peer state (default mic/cam = true) and broadcast join
        String roomId = request.getRoomId();
        String peerId = response.getPeerId();
        if (roomId != null && peerId != null) {
            PeerStateDto state = roomStateService.upsertPeerState(roomId, peerId, username, null, null);
            ObjectNode dataNode = objectMapper.valueToTree(state);
            ClientMessage msg = ClientMessage.builder()
                    .event("peer_joined")
                    .data(dataNode)
                    .build();
            messagingTemplate.convertAndSend("/topic/rooms/" + roomId, msg);
        }
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{peerId}/answer")
    public ResponseEntity<SimpleStatusResponse> setAnswer(@PathVariable String peerId, @RequestBody SetAnswerRequest body) {
        SimpleStatusResponse response = sfuClient.setAnswer(peerId, body);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{peerId}/candidate")
    public ResponseEntity<SimpleStatusResponse> addCandidate(@PathVariable String peerId, @RequestBody AddCandidateRequest body) {
        SimpleStatusResponse response = sfuClient.addCandidate(peerId, body);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{peerId}")
    public ResponseEntity<SimpleStatusResponse> deletePeer(@PathVariable String peerId) {
        SimpleStatusResponse response = sfuClient.deletePeer(peerId);
        return ResponseEntity.ok(response);
    }
}


