package lmh.webrtc.service;

import lmh.webrtc.dto.AddCandidateRequest;
import lmh.webrtc.dto.CreatePeerRequest;
import lmh.webrtc.dto.CreatePeerResponse;
import lmh.webrtc.dto.SetAnswerRequest;
import lmh.webrtc.dto.SimpleStatusResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class SfuClient {

    private final RestTemplate restTemplate;

    @Value("${sfu.base-url}")
    private String sfuBaseUrl;

    public CreatePeerResponse createPeer(CreatePeerRequest request) {
        String url = sfuBaseUrl + "/api/peer/create";
        ResponseEntity<CreatePeerResponse> res = restTemplate.postForEntity(url, request, CreatePeerResponse.class);
        return res.getBody();
    }

    public SimpleStatusResponse setAnswer(String peerId, SetAnswerRequest body) {
        String url = sfuBaseUrl + "/api/peer/" + peerId + "/answer";
        ResponseEntity<SimpleStatusResponse> res = restTemplate.postForEntity(url, body, SimpleStatusResponse.class);
        return res.getBody() != null ? res.getBody() : SimpleStatusResponse.builder().status("ok").build();
    }

    public SimpleStatusResponse addCandidate(String peerId, AddCandidateRequest body) {
        String url = sfuBaseUrl + "/api/peer/" + peerId + "/candidate";
        ResponseEntity<SimpleStatusResponse> res = restTemplate.postForEntity(url, body, SimpleStatusResponse.class);
        return res.getBody() != null ? res.getBody() : SimpleStatusResponse.builder().status("ok").build();
    }

    public SimpleStatusResponse deletePeer(String peerId) {
        String url = sfuBaseUrl + "/api/peer/" + peerId;
        ResponseEntity<Void> res = restTemplate.exchange(url, HttpMethod.DELETE, HttpEntity.EMPTY, Void.class);
        return SimpleStatusResponse.builder().status("ok").build();
    }
}


