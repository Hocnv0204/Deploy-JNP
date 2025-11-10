/**
 * IceHandler - Xử lý ICE candidates
 * Từ file webrtcManager.ts: method handleRemoteCandidate
 */
export class IceHandler {
  /**
   * Xử lý ICE candidate từ remote peer (SFU)
   * Được gọi từ STOMP message handler
   * Chuẩn hóa candidate data và thêm vào PeerConnection
   */
  async handleRemoteCandidate(
    pc: RTCPeerConnection,
    candidateData: any,
    peerId?: string,
    username?: string
  ): Promise<void> {
    const peerInfo = peerId || "unknown";
    const userInfo = username || peerInfo;

    console.log("[ICE] 📨 ========== RECEIVED REMOTE ICE CANDIDATE ==========");
    console.log(`[ICE] 📨 From Peer: ${peerInfo} (${userInfo})`);
    console.log("[ICE] 📨 Raw candidate data:", candidateData);

    if (!pc) {
      console.warn(
        "[ICE] ⚠️ PeerConnection not initialized, ignoring candidate"
      );
      console.log("[ICE] 📨 ================================================");
      return;
    }

    try {
      // Chuẩn hóa candidate data
      let candidateInit: RTCIceCandidateInit;

      if (typeof candidateData === "string") {
        // Nếu là string, tạo object với candidate string
        // Sử dụng "" hoặc 0 thay vì null để tránh lỗi "both null"
        candidateInit = {
          candidate: candidateData,
          sdpMid: "0",
          sdpMLineIndex: 0,
        };
        console.log("[ICE] 📨 Normalized from string format");
      } else if (candidateData.candidate) {
        // Nếu là object có thuộc tính candidate
        candidateInit = {
          candidate: candidateData.candidate,
          sdpMid: candidateData.sdpMid || "0",
          sdpMLineIndex: candidateData.sdpMLineIndex ?? 0,
        };
        console.log("[ICE] 📨 Normalized from object format");
      } else {
        // Sử dụng trực tiếp nếu đã đúng format
        candidateInit = candidateData;
        console.log("[ICE] 📨 Using as-is (already correct format)");
      }

      console.log("[ICE] 📨 Candidate:", candidateInit.candidate);
      console.log("[ICE] 📨 SDP Mid:", candidateInit.sdpMid);
      console.log("[ICE] 📨 SDP MLine Index:", candidateInit.sdpMLineIndex);
      console.log("[ICE] 📨 Adding to PeerConnection...");

      await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
      console.log("[ICE] ✅ Remote ICE candidate added successfully");
      console.log("[ICE] ✅ Candidate can now be used for connectivity checks");
    } catch (error) {
      console.error("[ICE] ❌ Error adding remote ICE candidate:", error);
    }
    console.log("[ICE] 📨 ================================================");
  }
}
