package lmh.webrtc.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PeerStateDto {
    private String peerId;
    private String roomId;
    private String username;
    private Boolean mic;
    private Boolean cam;
}


