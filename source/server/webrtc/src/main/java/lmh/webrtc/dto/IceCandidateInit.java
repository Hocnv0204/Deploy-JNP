package lmh.webrtc.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IceCandidateInit {
    private String candidate;
    private String sdpMid;
    private Integer sdpMLineIndex;
}


