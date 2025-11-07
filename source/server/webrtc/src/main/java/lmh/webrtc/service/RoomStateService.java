package lmh.webrtc.service;

import lmh.webrtc.dto.RoomStateResponse;
import lmh.webrtc.dto.SimpleStatusResponse;
import lmh.webrtc.dto.PeerStateDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class RoomStateService {

    private final Map<String, Map<String, PeerStateDto>> roomIdToPeers = new ConcurrentHashMap<>();

    public PeerStateDto upsertPeerState(String roomId,
                                        String peerId,
                                        String username,
                                        Boolean mic,
                                        Boolean cam) {
        roomIdToPeers.computeIfAbsent(roomId, k -> new ConcurrentHashMap<>());
        Map<String, PeerStateDto> peers = roomIdToPeers.get(roomId);

        PeerStateDto current = peers.getOrDefault(peerId, PeerStateDto.builder()
                .peerId(peerId)
                .roomId(roomId)
                .username(username)
                .mic(Boolean.TRUE)
                .cam(Boolean.TRUE)
                .build());

        if (username != null) {
            current.setUsername(username);
        }
        if (mic != null) {
            current.setMic(mic);
        }
        if (cam != null) {
            current.setCam(cam);
        }

        peers.put(peerId, current);
        return current;
    }

    public Optional<PeerStateDto> getPeerState(String roomId, String peerId) {
        Map<String, PeerStateDto> peers = roomIdToPeers.get(roomId);
        if (peers == null) return Optional.empty();
        return Optional.ofNullable(peers.get(peerId));
    }

    public RoomStateResponse getRoomState(String roomId) {
        Collection<PeerStateDto> values = roomIdToPeers.getOrDefault(roomId, Map.of()).values();
        return RoomStateResponse.builder()
                .roomId(roomId)
                .peers(new ArrayList<>(values))
                .build();
    }

    public void removePeer(String roomId, String peerId) {
        Map<String, PeerStateDto> peers = roomIdToPeers.get(roomId);
        if (peers != null) {
            peers.remove(peerId);
            if (peers.isEmpty()) {
                roomIdToPeers.remove(roomId);
            }
        }
    }
}


