import { getAccessToken, getUsernameFromToken } from "../../utils/auth";
import { API_BASE_URL } from "../../utils/constants";

/**
 * PeerApi - Xử lý tất cả các API calls liên quan đến peer
 * Từ file webrtcManager.ts: các methods createPeer, sendAnswer, sendCandidate, deletePeer
 */
export class PeerApi {
  private apiBaseUrl: string;

  constructor(apiBaseUrl?: string) {
    this.apiBaseUrl = (apiBaseUrl || API_BASE_URL).replace(/\/$/, "");
  }

  /**
   * Tạo peer qua REST API: /api/peer/create-with-username
   * Trả về peerId + offer + username
   */
  async createPeer(
    roomId: string,
    username: string,
    webhookUrl?: string
  ): Promise<{
    peerId: string;
    offer: RTCSessionDescriptionInit;
    username: string;
  }> {
    const createUrl = `${this.apiBaseUrl}/api/peer/create-with-username`;
    console.log(`[API] 📤 Creating peer: ${createUrl}`);
    
    const token = getAccessToken();
    const tokenUsername = getUsernameFromToken();

    if (!tokenUsername) {
      throw new Error("Username not found in token");
    }

    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        roomId: roomId,
        webhookUrl: webhookUrl || `${API_BASE_URL}/sfu-webhook`,
        username: username || tokenUsername,
      }),
    });

    if (!res.ok) {
      throw new Error(`Create peer failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      peerId: string;
      offer: RTCSessionDescriptionInit;
      username: string;
    };

    console.log("✅ Peer created with username:", data.username);
    return data;
  }

  /**
   * Gửi answer lên AppServer qua REST API
   * Endpoint: /api/peer/{peerId}/answer
   */
  async sendAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const answerUrl = `${this.apiBaseUrl}/api/peer/${peerId}/answer`;
    console.log(`[API] 📤 Sending answer to: ${answerUrl}`);
    console.log(
      `[API] Answer type: ${answer.type}, SDP length: ${answer.sdp?.length}`
    );

    const token = getAccessToken();
    const res = await fetch(answerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ answer }),
    });

    if (!res.ok) {
      throw new Error(`Send answer failed: ${res.status} ${res.statusText}`);
    }

    console.log("[API] ✅ Answer sent successfully");
  }

  /**
   * Gửi ICE Candidate lên AppServer qua REST API
   * Endpoint: /api/peer/{peerId}/candidate
   */
  async sendCandidate(
    peerId: string,
    candidate: RTCIceCandidate
  ): Promise<void> {
    if (!peerId) {
      console.warn("[ICE] ⚠️ Cannot send candidate: peerId missing");
      return;
    }

    try {
      const candidateJson = candidate.toJSON();
      const candidateUrl = `${this.apiBaseUrl}/api/peer/${peerId}/candidate`;

      console.log(`[API] 📤 Sending ICE candidate to: ${candidateUrl}`);

      // Body theo format AddCandidateRequest: { candidate: { candidate, sdpMid, sdpMLineIndex } }
      const token = getAccessToken();
      const res = await fetch(candidateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          candidate: {
            candidate: candidateJson.candidate,
            sdpMid: candidateJson.sdpMid,
            sdpMLineIndex: candidateJson.sdpMLineIndex,
          },
        }),
      });

      if (!res.ok) {
        console.error(
          `[API] ❌ Failed to send candidate: ${res.status} ${res.statusText}`
        );
      } else {
        console.log("[API] ✅ ICE Candidate sent successfully");
      }
    } catch (error) {
      console.error("[API] ❌ Error sending candidate:", error);
    }
  }

  /**
   * Xóa peer trên App Server
   * Endpoint: DELETE /api/peer/{peerId}
   */
  async deletePeer(peerId: string): Promise<void> {
    if (!peerId) {
      console.warn("[API] ⚠️ Cannot delete peer: peerId missing");
      return;
    }

    try {
      const url = `${this.apiBaseUrl}/api/peer/${peerId}`;
      console.log(`[API] 🗑️ Deleting peer: ${url}`);

      const token = getAccessToken();
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) {
        console.warn(
          `[API] ⚠️ Delete peer failed: ${res.status} ${res.statusText}`
        );
      } else {
        const result = await res.json().catch(() => ({}));
        console.log("[API] ✅ Peer deleted successfully:", result);
      }
    } catch (err) {
      console.error("[API] ❌ Error deleting peer:", err);
    }
  }

  /**
   * Set API base URL
   */
  setApiBaseUrl(apiBaseUrl: string): void {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
  }

  /**
   * Get API base URL
   */
  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }
}
