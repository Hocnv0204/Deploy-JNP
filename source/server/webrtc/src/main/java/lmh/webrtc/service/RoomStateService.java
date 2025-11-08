package lmh.webrtc.service;

import lmh.webrtc.dto.RoomStateResponse;
import lmh.webrtc.dto.SimpleStatusResponse;
import lmh.webrtc.dto.PeerStateDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

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
        log.info("Upserted peer state: roomId={}, peerId={}, username={}", roomId, peerId, username);
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
            PeerStateDto removed = peers.remove(peerId);
            if (removed != null) {
                log.info("Removed peer: roomId={}, peerId={}, username={}", roomId, peerId, removed.getUsername());
            }
            if (peers.isEmpty()) {
                roomIdToPeers.remove(roomId);
                log.info("Room is now empty, removed: roomId={}", roomId);
            }
        }
    }

    // ✅ THÊM: Lấy username từ peerId (search across all rooms)
    public String getUsername(String peerId) {
        for (Map<String, PeerStateDto> peers : roomIdToPeers.values()) {
            PeerStateDto peerState = peers.get(peerId);
            if (peerState != null) {
                return peerState.getUsername();
            }
        }
        return null;
    }

    // ✅ THÊM: Lấy roomId từ peerId (search across all rooms)
    public String getRoomId(String peerId) {
        for (Map.Entry<String, Map<String, PeerStateDto>> entry : roomIdToPeers.entrySet()) {
            if (entry.getValue().containsKey(peerId)) {
                return entry.getKey();
            }
        }
        return null;
    }

    // ✅ THÊM: Lấy tất cả peerIds trong room
    public Set<String> getPeersInRoom(String roomId) {
        Map<String, PeerStateDto> peers = roomIdToPeers.get(roomId);
        if (peers == null) {
            return Set.of();
        }
        return peers.keySet();
    }

    // ✅ THÊM: Lấy tất cả peer states trong room
    public Collection<PeerStateDto> getPeerStatesInRoom(String roomId) {
        Map<String, PeerStateDto> peers = roomIdToPeers.get(roomId);
        if (peers == null) {
            return List.of();
        }
        return new ArrayList<>(peers.values());
    }

    // ✅ THÊM: Tìm source peers (peers khác trong cùng room)
    public Collection<PeerStateDto> getOtherPeersInRoom(String roomId, String excludePeerId) {
        Map<String, PeerStateDto> peers = roomIdToPeers.get(roomId);
        if (peers == null) {
            return List.of();
        }
        return peers.values().stream()
                .filter(peer -> !peer.getPeerId().equals(excludePeerId))
                .collect(Collectors.toList());
    }
}