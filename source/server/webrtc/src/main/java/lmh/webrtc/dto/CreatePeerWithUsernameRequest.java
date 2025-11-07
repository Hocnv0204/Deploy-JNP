package lmh.webrtc.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreatePeerWithUsernameRequest {
    private String roomId;
    private String webhookUrl;
    private String username;
}


