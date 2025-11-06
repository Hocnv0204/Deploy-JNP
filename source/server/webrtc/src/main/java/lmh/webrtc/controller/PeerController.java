package lmh.webrtc.controller;

import lmh.webrtc.dto.AddCandidateRequest;
import lmh.webrtc.dto.CreatePeerRequest;
import lmh.webrtc.dto.CreatePeerResponse;
import lmh.webrtc.dto.SetAnswerRequest;
import lmh.webrtc.dto.SimpleStatusResponse;
import lmh.webrtc.service.SfuClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
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

    @PostMapping("/create")
    public ResponseEntity<CreatePeerResponse> createPeer(@RequestBody CreatePeerRequest request) {
        CreatePeerResponse response = sfuClient.createPeer(request);
        String username = org.springframework.security.core.context.SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getName();
        response.setUsername(username);
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


