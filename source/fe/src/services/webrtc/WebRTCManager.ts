/**
 * WebRTC Manager - Quản lý RTCPeerConnection và media streams
 * Kết nối với STOMP backend (Spring Boot)
 * Refactored từ webrtcManager.ts để dễ debug hơn
 */
import { StompHandler } from "../signaling/StompHandler";
import { PeerApi } from "../api/PeerApi";
import { MediaHandler } from "./MediaHandler";
import { IceHandler } from "../connection/IceHandler";
import { PeerConnectionHandler } from "../connection/PeerConnectionHandler";
import { getUsernameFromToken } from "../../utils/auth";
import { API_BASE_URL } from "../../utils/constants";
import type { WebRTCConfig } from "./WebRTCConfig";
// Message format từ backend (ClientMessage)
// Backend gửi message qua STOMP với format này khi có peer mới tham gia
interface ClientMessage {
  event: "sfu-offer" | "sfu-candidate";
  data: {
    peerId?: string;
    offer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    sourcePeerId?: string;
    sourceUsername?: string;
    type?: string;
    sdp?: string;
  };
}

export class WebRTCManager {
  private pcHandler: PeerConnectionHandler | null = null;
  private localStream: MediaStream | null = null;
  private peerId: string | null = null;
  private stompHandler: StompHandler;
  private api: PeerApi;
  private mediaHandler: MediaHandler;
  private iceHandler: IceHandler;
  private config: WebRTCConfig;
  private apiBaseUrl: string | null = null; // Lưu apiBaseUrl để dùng khi gửi candidate
  private peerSubscription: any | null = null; // Subscription theo peerId để nhận event từ SFU

  // 🔥 FIX: Track remote streams để tránh duplicate
  private remoteStreams: Map<string, MediaStream> = new Map();

  // ✅ Map peerId -> username để hiển thị tên người dùng
  private peerUsernames: Map<string, string> = new Map();

  // ✅ Track current source peer ID để biết track từ peer nào
  private currentSourcePeerId: string | null = null;

  constructor(config: WebRTCConfig) {
    this.config = {
      ...config, // ✅ Đặt trước, để cho phép bạn override nếu cần

      iceServers: [
        // ✅ 1. STUN Google fallback
        {
          urls: [
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
          ],
        },
        // ✅ 2. STUN Metered (ổn định và ít bị block)
        { urls: "stun:stun.relay.metered.ca:80" },

        // ✅ 3. TURN server (bắt buộc cho NAT / mạng công ty)
        {
          urls: [
            "turn:global.relay.metered.ca:80",
            "turn:global.relay.metered.ca:80?transport=tcp",
            "turn:global.relay.metered.ca:443",
            "turns:global.relay.metered.ca:443?transport=tcp",
          ],
          username: "b25f13a908741ebc9b2a58c7",
          credential: "flOn9NEcWNvD8clt",
        },
      ],

      // ✅ (Tùy chọn) dự trữ sẵn ICE candidate
      iceCandidatePoolSize: 10,
    };

    this.stompHandler = new StompHandler(this.config.signalingUrl);
    this.api = new PeerApi(this.config.apiBaseUrl || API_BASE_URL);
    this.mediaHandler = new MediaHandler();
    this.iceHandler = new IceHandler();
  }

  /**
   * Kết nối STOMP WebSocket
   * Sử dụng @stomp/stompjs để kết nối với App Server
   */
  async connectStomp(): Promise<void> {
    return this.stompHandler.connect();
  }

  /**
   * @deprecated Sử dụng connectStomp() thay thế
   */
  async initSignaling(): Promise<void> {
    return this.connectStomp();
  }

  /**
   * Tham gia phòng qua REST API: /api/peer/create => trả về peerId + offer
   * Sau đó tạo answer và gửi lại qua /api/peer/answer
   */
  async joinRoomViaApi(
    apiBaseUrl?: string,
    webhookUrl?: string
  ): Promise<void> {
    // Lưu apiBaseUrl để dùng khi gửi candidate
    // Sử dụng tham số hoặc fallback từ config hoặc API_BASE_URL
    const baseUrl = apiBaseUrl || this.config.apiBaseUrl || API_BASE_URL;
    this.apiBaseUrl = baseUrl.replace(/\/$/, "");
    this.api.setApiBaseUrl(this.apiBaseUrl);

    // Kết nối STOMP nếu chưa kết nối (để nhận event từ SFU khi có peer mới)
    if (!this.stompHandler.connected) {
      console.log("[STOMP] 🔌 Connecting STOMP before joining room...");
      await this.connectStomp();
    }

    // đảm bảo có local stream trước để add tracks khi tạo PC
    if (!this.localStream) {
      this.localStream = await this.mediaHandler.getLocalStream();
    }

    const username = getUsernameFromToken();
    if (!username) {
      throw new Error("Username not found in token");
    }

    const data = await this.api.createPeer(
      this.config.roomId,
      username,
      webhookUrl || `${API_BASE_URL}/sfu-webhook`
    );

    console.log("✅ Peer created with username:", data.username);

    // ✅ Lưu map peerId -> username
    this.peerUsernames.set(data.peerId, data.username);
    this.peerId = data.peerId;

    // ✅ QUAN TRỌNG: Subscribe channel TRƯỚC khi xử lý offer ban đầu
    // Đảm bảo subscription đã active để không bỏ lỡ messages từ SFU khi có peer mới tham gia
    if (this.stompHandler.connected) {
      console.log(
        "[WebRTC] 📡 Subscribing to STOMP channel for peer:",
        data.peerId
      );
      this.subscribeToPeerChannel(data.peerId);
      // Đợi một chút để đảm bảo subscription đã active trước khi xử lý offer
      await new Promise((resolve) => setTimeout(resolve, 200));
      console.log("[WebRTC] ✅ STOMP subscription should be active now");
    } else {
      console.warn(
        "[WebRTC] ⚠️ STOMP not connected, cannot subscribe to peer channel"
      );
    }

    await this.handleOfferAndReplyAnswerViaApi(data.peerId, data.offer);
  }

  private async handleOfferAndReplyAnswerViaApi(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    if (!this.apiBaseUrl) {
      throw new Error("apiBaseUrl not set");
    }

    try {
      // lưu peerId
      this.peerId = peerId;

      // tạo PC nếu chưa có
      if (!this.pcHandler) {
        console.log(`[WebRTC] 🔧 Creating PeerConnection for peer: ${peerId}`);
        this.createPeerConnection();
      }

      if (!this.pcHandler) {
        throw new Error("PeerConnection not initialized");
      }

      if (this.localStream) {
        console.log(`[WebRTC] 📤 Adding local tracks to PeerConnection...`);
        this.pcHandler.addLocalStream(this.localStream);
      }

      // đặt remote offer
      console.log(
        `[WebRTC] 📥 Setting remote offer from SFU for peer: ${peerId}`
      );
      await this.pcHandler.setRemoteDescription(offer);
      console.log(`[WebRTC] ✅ Remote offer set successfully`);

      // tạo answer
      console.log(`[WebRTC] 🔧 Creating answer for peer: ${peerId}`);
      const answer = await this.pcHandler.createAnswer();
      console.log(`[WebRTC] ✅ Local answer set successfully`);

      // gửi answer về server qua endpoint /api/peer/{peerId}/answer
      // App Server sẽ chuyển tiếp answer này lên SFU
      await this.api.sendAnswer(peerId, answer);

      console.log("[WebRTC] ✅ Answer sent via API");
    } catch (error) {
      console.error("[WebRTC] ❌ Error in API flow:", error);
      throw error;
    }
  }

  /**
   * Xử lý offer từ SFU khi có peer mới tham gia phòng
   * Được gọi từ STOMP message handler
   * @param peerId - ID của chính client này
   * @param offer - SDP offer từ SFU
   * @param sourcePeerId - ID của peer gửi track (nếu có)
   */
  private async handleOfferFromSFU(
    peerId: string,
    offer: RTCSessionDescriptionInit,
    sourcePeerId?: string
  ): Promise<void> {
    console.log(`[WebRTC] 📨 Handling offer from SFU for peer: ${peerId}`);
    console.log(`[WebRTC] Offer SDP: ${offer.sdp?.substring(0, 100)}...`);

    // Lưu sourcePeerId để dùng trong ontrack handler
    if (sourcePeerId) {
      this.currentSourcePeerId = sourcePeerId;
      console.log(`[WebRTC] 📌 Source Peer ID: ${sourcePeerId}`);
    } else {
      console.warn(`[WebRTC] ⚠️ No source peer ID provided`);
    }

    if (!this.apiBaseUrl) {
      console.error("[WebRTC] ❌ apiBaseUrl not set");
      return;
    }

    try {
      // Tạo PeerConnection nếu chưa có (cho peer mới)
      // Lưu ý: Mỗi peer mới có thể cần PeerConnection riêng, nhưng với SFU thường chỉ cần 1 PC
      const isNewPc = !this.pcHandler;
      if (isNewPc) {
        console.log("[WebRTC] 🔧 Creating new PeerConnection for new peer");
        this.createPeerConnection();
      }

      if (!this.pcHandler) {
        throw new Error("PeerConnection not initialized");
      }

      // Chỉ thêm local stream khi PC mới được tạo
      if (isNewPc && this.localStream) {
        this.pcHandler.addLocalStream(this.localStream);
      }

      // 1. Set Remote Description (offer từ SFU)
      console.log("[WebRTC] 🔧 Setting remote description (offer)");
      await this.pcHandler.setRemoteDescription(offer);
      console.log("[WebRTC] ✅ Remote description set");

      // 2. Tạo Answer
      console.log("[WebRTC] 🔧 Creating answer");
      const answer = await this.pcHandler.createAnswer();
      console.log("[WebRTC] ✅ Answer created");

      // 3. Gửi Answer lên AppServer qua API
      await this.api.sendAnswer(peerId, answer);

      console.log(
        `[WebRTC] ✅ Offer handled and answer sent for peer: ${peerId}`
      );
    } catch (error) {
      console.error(
        `[WebRTC] ❌ Error handling offer from SFU for peer ${peerId}:`,
        error
      );
    }
  }

  /**
   * Subscribe channel theo peerId để nhận event từ SFU khi có peer mới tham gia
   * Backend gửi đến /queue/peers/{peerId} với format ClientMessage
   */
  private subscribeToPeerChannel(peerId: string): void {
    const client = this.stompHandler.client;
    if (!client || !this.stompHandler.connected) {
      console.warn("[STOMP] ⚠️ Cannot subscribe: STOMP not connected");
      return;
    }

    // Unsubscribe channel cũ nếu có
    if (this.peerSubscription) {
      this.peerSubscription.unsubscribe();
      this.peerSubscription = null;
    }

    // Subscribe channel mới: /queue/peers/{peerId}
    const channel = `/queue/peers/${peerId}`;
    console.log(`[STOMP] 📡 Subscribing to channel: ${channel}`);

    this.peerSubscription = client.subscribe(
      channel,
      async (message: { body: string }) => {
        try {
          const clientMessage = JSON.parse(message.body) as ClientMessage;
          console.log("[STOMP] 📨 Received message:", clientMessage);

          switch (clientMessage.event) {
            case "sfu-offer": {
              console.log(
                "📩 ========== RECEIVED SFU-OFFER MESSAGE =========="
              );
              console.log("📩 Raw data:", clientMessage.data);

              const dataObj = clientMessage.data as any;

              // ✅ FIX 1: Trích xuất thông tin NGAY LẬP TỨC
              const sourceUsername = dataObj.sourceUsername;
              const sourcePeerId = dataObj.sourcePeerId;

              console.log(`📩 Source Peer ID: ${sourcePeerId || "N/A"}`);
              console.log(`📩 Source Username: ${sourceUsername || "N/A"}`);

              // ✅ FIX 2: LƯU MAPPING TRƯỚC KHI XỬ LÝ OFFER
              // Đây là bước QUAN TRỌNG NHẤT
              if (sourceUsername && sourcePeerId) {
                this.peerUsernames.set(sourcePeerId, sourceUsername);
                this.currentSourcePeerId = sourcePeerId;
                console.log(
                  `✅ Saved mapping BEFORE handling offer: ${sourcePeerId} -> ${sourceUsername}`
                );
              } else if (sourceUsername) {
                // Fallback: dùng username làm key nếu không có sourcePeerId
                const fallbackKey = `peer_${sourceUsername}`;
                this.peerUsernames.set(fallbackKey, sourceUsername);
                this.currentSourcePeerId = fallbackKey;
                console.log(
                  `✅ Saved fallback mapping: ${fallbackKey} -> ${sourceUsername}`
                );
              } else {
                console.warn(`⚠️ No source info - tracks will be anonymous`);
                this.currentSourcePeerId = null;
              }

              // ✅ FIX 3: Parse offer SAU KHI đã lưu mapping
              let offer: RTCSessionDescriptionInit | undefined;

              if (dataObj.type === "offer" && dataObj.sdp) {
                offer = { type: dataObj.type, sdp: dataObj.sdp };
                console.log("📩 Parsed offer from data (format 1)");
              } else if (dataObj.offer?.type === "offer") {
                offer = dataObj.offer;
                console.log("📩 Parsed offer from data.offer (format 2)");
              } else {
                console.error("❌ Cannot parse offer from message");
                return; // Exit early nếu không parse được offer
              }

              // ✅ FIX 4: Gọi handleOfferFromSFU SAU KHI đã lưu mapping
              if (offer && offer.type === "offer" && offer.sdp) {
                console.log(`📩 Calling handleOfferFromSFU...`);
                console.log(
                  `📩 Username mapping already saved: ${
                    this.currentSourcePeerId
                  } -> ${this.peerUsernames.get(
                    this.currentSourcePeerId || ""
                  )}`
                );
                await this.handleOfferFromSFU(peerId, offer, sourcePeerId);
                console.log("✅ handleOfferFromSFU completed");
              } else {
                console.error("[STOMP] ❌ Invalid offer");
              }

              console.log(
                "📩 ================================================"
              );
              break;
            }

            case "sfu-candidate": {
              // Format: { event: "sfu-candidate", data: { candidate } }
              if (clientMessage.data.candidate && this.pcHandler) {
                const peerInfo = this.peerId || "unknown";
                const userInfo = this.peerUsernames.get(peerInfo) || peerInfo;
                await this.iceHandler.handleRemoteCandidate(
                  this.pcHandler.connection,
                  clientMessage.data.candidate,
                  peerInfo,
                  userInfo
                );
              } else {
                console.error(
                  "[STOMP] ❌ Invalid sfu-candidate message:",
                  clientMessage
                );
              }
              break;
            }

            default:
              console.warn("[STOMP] ⚠️ Unknown event:", clientMessage.event);
          }
        } catch (error) {
          console.error("[STOMP] ❌ Error parsing message:", error);
        }
      },
      { id: `peer-subscription-${peerId}` }
    );

    console.log(`[STOMP] ✅ Subscribed to peer channel: ${channel}`);
  }

  /**
   * Lấy local media stream (camera + microphone)
   */
  async getLocalStream(): Promise<MediaStream> {
    if (!this.localStream) {
      this.localStream = await this.mediaHandler.getLocalStream();
    }
    return this.localStream;
  }

  /**
   * Tham gia phòng - Gửi join-room event
   */
  async joinRoom(): Promise<void> {
    if (!this.stompHandler.connected) {
      throw new Error("STOMP client not connected");
    }

    const payload = {
      event: "join-room",
      roomId: this.config.roomId,
      userId: this.config.userId,
    };

    console.log("[WebRTC] Sending join-room:", payload);

    this.stompHandler.client?.publish({
      destination: "/app/signaling",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Tạo RTCPeerConnection
   */
  private createPeerConnection(): void {
    const config: RTCConfiguration = {
      iceServers: this.config.iceServers,
    };

    this.pcHandler = new PeerConnectionHandler(config, {
      onTrack: (event: RTCTrackEvent) => {
        this.handleRemoteTrack(event);
      },
      onIceCandidate: (event: RTCPeerConnectionIceEvent) => {
        this.handleLocalIceCandidate(event);
      },
      onConnectionStateChange: (state: RTCPeerConnectionState) => {
        this.config.onConnectionStateChange?.(state);
      },
      onIceConnectionStateChange: (state: RTCIceConnectionState) => {
        this.config.onIceConnectionStateChange?.(state);
      },
      onConnectionReady: () => {
        this.config.onConnectionReady?.();
      },
    });
  }

  /**
   * Xử lý khi nhận được remote track - tránh duplicate streams
   */
  private handleRemoteTrack(event: RTCTrackEvent): void {
    const trackKind = event.track.kind;

    // ✅ Lấy sourcePeerId từ currentSourcePeerId
    const sourcePeerId = this.currentSourcePeerId || "unknown";

    console.log(`[WebRTC] 📹 ========== RECEIVED REMOTE TRACK ==========`);
    console.log(`[WebRTC] 📹 Track Type: ${trackKind.toUpperCase()}`);
    console.log(`[WebRTC] 📹 Current Source Peer ID: ${sourcePeerId}`);
    console.log(
      `[WebRTC] 📹 Usernames Map:`,
      Array.from(this.peerUsernames.entries())
    );

    // ✅ Lookup username với nhiều fallback strategies
    let sourceUsername = this.peerUsernames.get(sourcePeerId);

    if (!sourceUsername) {
      console.warn(
        `[WebRTC] ⚠️ Username not found for peerId: ${sourcePeerId}`
      );

      // Strategy 1: Tìm trong map bằng partial match
      for (const [key, value] of this.peerUsernames.entries()) {
        if (key.includes(sourcePeerId) || sourcePeerId.includes(key)) {
          sourceUsername = value;
          console.log(
            `[WebRTC] 📹 Found via partial match: ${key} -> ${value}`
          );
          break;
        }
      }

      // Strategy 2: Nếu chỉ có 1 peer khác, dùng nó
      if (!sourceUsername && this.peerUsernames.size === 1) {
        sourceUsername = Array.from(this.peerUsernames.values())[0];
        console.log(`[WebRTC] 📹 Using only available peer: ${sourceUsername}`);
      }

      // Strategy 3: Generate fallback username
      if (!sourceUsername) {
        sourceUsername = `User-${sourcePeerId.substring(0, 8)}`;
        console.log(
          `[WebRTC] 📹 Generated fallback username: ${sourceUsername}`
        );
      }
    } else {
      console.log(`[WebRTC] 📹 ✅ Found username in map: ${sourceUsername}`);
    }

    if (event.streams[0]) {
      const stream = event.streams[0];
      const streamId = stream.id;

      console.log(`[WebRTC] 📹 Stream ID: ${streamId}`);
      console.log(`[WebRTC] 📹 Using username: ${sourceUsername}`);

      // ✅ Duplicate protection
      if (this.remoteStreams.has(streamId)) {
        console.log(`[WebRTC] ⚠️ Stream ${streamId} already exists - SKIPPING`);
        return;
      }

      if (stream.getTracks().length === 0) {
        console.warn(`[WebRTC] ⚠️ Stream has no tracks - SKIPPING`);
        return;
      }

      // ✅ Add stream và notify UI
      console.log(
        `[WebRTC] 🆕 Adding NEW stream with username: ${sourceUsername}`
      );
      this.remoteStreams.set(streamId, stream);
      this.config.onRemoteStreamAdded?.(stream, sourceUsername);

      console.log(
        `[WebRTC] ✅ Total remote streams: ${this.remoteStreams.size}`
      );
    }
    console.log(`[WebRTC] 📹 ============================================`);
  }

  /**
   * Xử lý ICE Candidate - gửi lên App Server qua REST API
   */
  private handleLocalIceCandidate(event: RTCPeerConnectionIceEvent): void {
    if (event.candidate) {
      const candidate = event.candidate;
      const peerId = this.peerId || "unknown";
      const username = this.peerUsernames.get(peerId) || peerId;

      console.log(
        "[ICE] 🧊 ========== LOCAL ICE CANDIDATE GENERATED =========="
      );
      console.log(`[ICE] 🧊 Peer: ${peerId} (${username})`);
      console.log("[ICE] 🧊 Candidate Type:", candidate.type || "unknown");
      console.log("[ICE] 🧊 Candidate:", candidate.candidate);
      console.log("[ICE] 🧊 SDP Mid:", candidate.sdpMid);
      console.log("[ICE] 🧊 SDP MLine Index:", candidate.sdpMLineIndex);

      if (this.peerId) {
        console.log("[ICE] 🧊 📤 Sending candidate to SFU via API...");
        // Gọi async method nhưng không await (fire and forget)
        this.api.sendCandidate(this.peerId, candidate).catch((err) => {
          console.error("[ICE] ❌ Error sending candidate:", err);
        });
      } else {
        console.warn("[ICE] ⚠️ Cannot send candidate: peerId missing");
      }
      console.log("[ICE] 🧊 ================================================");
    } else {
      console.log("[ICE] ✅ ========== ALL ICE CANDIDATES GATHERED ==========");
      console.log("[ICE] ✅ ICE gathering complete - ready for connection");
      console.log("[ICE] ✅ ================================================");
    }
  }

  /**
   * Rời phòng
   * - Gọi DELETE API để xóa peer trên App Server
   * - Đóng PeerConnection
   * - Dừng local media streams
   * - Disconnect STOMP
   */
  async leaveRoom(): Promise<void> {
    console.log("[WebRTC] 🚪 Leaving room...");

    if (!this.peerId) {
      console.log("[WebRTC] ⚠️ No peerId, cleaning up local resources only");
      // vẫn đóng tài nguyên local nếu chưa có peerId
      if (this.pcHandler) {
        this.pcHandler.close();
        this.pcHandler = null;
        console.log("[WebRTC] ✅ PeerConnection closed");
      }
      if (this.localStream) {
        this.mediaHandler.stopLocalStream();
        this.localStream = null;
        console.log("[WebRTC] ✅ Local media streams stopped");
      }
      return;
    }

    // 1. Gọi REST API xóa peer trên App Server
    if (this.apiBaseUrl) {
      await this.api.deletePeer(this.peerId);
    }

    // 2. Unsubscribe STOMP channel
    if (this.peerSubscription) {
      this.peerSubscription.unsubscribe();
      this.peerSubscription = null;
      console.log("[STOMP] ✅ Unsubscribed from peer channel");
    }

    // 3. Disconnect STOMP
    if (this.stompHandler.connected) {
      this.stompHandler.disconnect();
    }

    // 4. Đóng PeerConnection
    if (this.pcHandler) {
      this.pcHandler.close();
      this.pcHandler = null;
      console.log("[WebRTC] ✅ PeerConnection closed");
    }

    // 5. Dừng local media streams
    if (this.localStream) {
      this.mediaHandler.stopLocalStream();
      this.localStream = null;
    }

    // 6. 🔥 FIX: Clear remote streams Map
    this.remoteStreams.clear();
    console.log("[WebRTC] ✅ Remote streams cleared");

    // 7. ✅ Clear peer usernames Map
    this.peerUsernames.clear();
    console.log("[WebRTC] ✅ Peer usernames cleared");

    this.peerId = null;
    console.log("[WebRTC] ✅ Left room successfully");
  }

  /**
   * Disconnect STOMP connection
   */
  disconnect(): void {
    this.stompHandler.disconnect();
  }

  /**
   * Lấy local stream
   */
  getLocal(): MediaStream | null {
    return this.mediaHandler.getStream();
  }

  /**
   * Lấy RTCPeerConnection
   */
  getPeerConnection(): RTCPeerConnection | null {
    return this.pcHandler?.connection || null;
  }

  /**
   * Toggle audio
   */
  toggleAudio(enabled: boolean): void {
    this.mediaHandler.toggleAudio(enabled);
  }

  /**
   * Toggle video
   */
  toggleVideo(enabled: boolean): void {
    this.mediaHandler.toggleVideo(enabled);
  }
}
