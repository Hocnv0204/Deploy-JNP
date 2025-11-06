/**
 * WebRTC Manager - Quản lý RTCPeerConnection và media streams
 * Kết nối với STOMP backend (Spring Boot)
 */
import { Client as StompClient } from "@stomp/stompjs";

export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
  signalingUrl: string;
  roomId: string;
  userId: string;
  apiBaseUrl?: string; // ví dụ: http://localhost:8081
  onRemoteStreamAdded?: (stream: MediaStream, peerId: string) => void;
  onRemoteStreamRemoved?: (peerId: string) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}

// Message format từ backend (ClientMessage)
// Backend gửi message qua STOMP với format này khi có peer mới tham gia
interface ClientMessage {
  event: "sfu-offer" | "sfu-candidate";
  data: {
    peerId?: string;
    offer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
}

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private peerId: string | null = null;
  private stompClient: any | null = null;
  private config: WebRTCConfig;
  private apiBaseUrl: string | null = null; // Lưu apiBaseUrl để dùng khi gửi candidate
  private peerSubscription: any | null = null; // Subscription theo peerId để nhận event từ SFU

  // 🔥 FIX: Track remote streams để tránh duplicate
  private remoteStreams: Map<string, MediaStream> = new Map();

  constructor(config: WebRTCConfig) {
    this.config = {
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:stun1.l.google.com:19302"] },
      ],
      ...config,
    };
  }

  /**
   * Kết nối STOMP WebSocket
   * Sử dụng @stomp/stompjs để kết nối với App Server
   */
  async connectStomp(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("[STOMP] 🔌 Connecting to:", this.config.signalingUrl);

      // Nếu BE dùng withSockJS() ở endpoint "/websocket", khi dùng WebSocket thuần
      // cần nối thêm "/websocket" vào cuối để thành đường dẫn native WS
      const wsBase = this.config.signalingUrl.replace(/^http/, "ws");
      const wsUrl = wsBase.endsWith("/websocket")
        ? `${wsBase}/websocket`
        : `${wsBase}`;

      console.log("[STOMP] 🌐 WebSocket URL:", wsUrl);

      this.stompClient = new StompClient({
        brokerURL: wsUrl,
        debug: (msg: string) => {
          // Log STOMP debug messages
          if (msg.includes("Opening") || msg.includes("Connected")) {
            console.log(`[STOMP] ${msg}`);
          }
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        onConnect: () => {
          console.log("[STOMP] ✅ Connected successfully");
          this.subscribeToSignaling();
          resolve();
        },
        onDisconnect: () => {
          console.log("[STOMP] 🔌 Disconnected");
        },
        onStompError: (error: any) => {
          console.error("[STOMP] ❌ STOMP Error:", error);
          reject(error);
        },
        onWebSocketError: (error: any) => {
          console.error("[STOMP] ❌ WebSocket Error:", error);
          reject(error);
        },
      });

      console.log("[STOMP] 🔄 Activating STOMP client...");
      this.stompClient.activate();
    });
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
  async joinRoomViaApi(apiBaseUrl: string, webhookUrl?: string): Promise<void> {
    // Lưu apiBaseUrl để dùng khi gửi candidate
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");

    // Kết nối STOMP nếu chưa kết nối (để nhận event từ SFU khi có peer mới)
    if (!this.stompClient?.connected) {
      console.log("[STOMP] 🔌 Connecting STOMP before joining room...");
      await this.connectStomp();
    }

    // đảm bảo có local stream trước để add tracks khi tạo PC
    if (!this.localStream) {
      await this.getLocalStream();
    }

    const createUrl = `${this.apiBaseUrl}/api/peer/create`;
    console.log(`[API] 📤 Creating peer: ${createUrl}`);
    const res = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: this.config.roomId,
        webhookUrl: webhookUrl || "http://localhost:8081/sfu-webhook",
      }),
    });
    if (!res.ok) {
      throw new Error(`Create peer failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      peerId: string;
      offer: RTCSessionDescriptionInit;
    };

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

      // Subscribe channel để nhận event từ SFU khi có peer mới tham gia
      if (this.stompClient?.connected) {
        this.subscribeToPeerChannel(peerId);
      }

      // tạo PC nếu chưa có
      if (!this.pc) {
        this.createPeerConnection();
        if (this.localStream) {
          this.localStream.getTracks().forEach((track) => {
            if (this.pc && this.localStream) {
              this.pc.addTrack(track, this.localStream);
            }
          });
        }
      }

      if (!this.pc) {
        throw new Error("PeerConnection not initialized");
      }

      // đặt remote offer
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      // tạo answer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // gửi answer về server qua endpoint /api/peer/{peerId}/answer
      // App Server sẽ chuyển tiếp answer này lên SFU
      // Body theo format SetAnswerRequest: { answer: { type, sdp } }
      const answerUrl = `${this.apiBaseUrl}/api/peer/${peerId}/answer`;
      const res = await fetch(answerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) {
        throw new Error(`Send answer failed: ${res.status}`);
      }

      console.log("[WebRTC] ✅ Answer sent via API");
    } catch (error) {
      console.error("[WebRTC] ❌ Error in API flow:", error);
      throw error;
    }
  }

  /**
   * Xử lý offer từ SFU khi có peer mới tham gia phòng
   * Được gọi từ STOMP message handler
   */
  private async handleOfferFromSFU(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    console.log(`[WebRTC] 📨 Handling offer from SFU for peer: ${peerId}`);
    console.log(`[WebRTC] Offer SDP: ${offer.sdp?.substring(0, 100)}...`);

    if (!this.apiBaseUrl) {
      console.error("[WebRTC] ❌ apiBaseUrl not set");
      return;
    }

    try {
      // Tạo PeerConnection nếu chưa có (cho peer mới)
      // Lưu ý: Mỗi peer mới có thể cần PeerConnection riêng, nhưng với SFU thường chỉ cần 1 PC
      if (!this.pc) {
        console.log("[WebRTC] 🔧 Creating new PeerConnection for new peer");
        this.createPeerConnection();
        if (this.localStream) {
          this.localStream.getTracks().forEach((track) => {
            if (this.pc && this.localStream) {
              this.pc.addTrack(track, this.localStream);
            }
          });
        }
      }

      if (!this.pc) {
        throw new Error("PeerConnection not initialized");
      }

      // 1. Set Remote Description (offer từ SFU)
      console.log("[WebRTC] 🔧 Setting remote description (offer)");
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log("[WebRTC] ✅ Remote description set");

      // 2. Tạo Answer
      console.log("[WebRTC] 🔧 Creating answer");
      const answer = await this.pc.createAnswer();
      console.log("[WebRTC] ✅ Answer created");

      // 3. Set Local Description
      console.log("[WebRTC] 🔧 Setting local description (answer)");
      await this.pc.setLocalDescription(answer);
      console.log("[WebRTC] ✅ Local description set");

      // 4. Gửi Answer lên AppServer qua API
      await this.sendAnswerToApi(peerId, answer);

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
   * Xử lý ICE candidate từ remote peer (SFU)
   * Được gọi từ STOMP message handler
   */
  private async handleRemoteCandidate(candidateData: any): Promise<void> {
    console.log("[ICE] 📨 Received remote ICE candidate");
    console.log("[ICE] Candidate data:", candidateData);

    if (!this.pc) {
      console.warn(
        "[ICE] ⚠️ PeerConnection not initialized, ignoring candidate"
      );
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
      } else if (candidateData.candidate) {
        // Nếu là object có thuộc tính candidate
        candidateInit = {
          candidate: candidateData.candidate,
          sdpMid: candidateData.sdpMid || "0",
          sdpMLineIndex: candidateData.sdpMLineIndex ?? 0,
        };
      } else {
        // Sử dụng trực tiếp nếu đã đúng format
        candidateInit = candidateData;
      }

      await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
      console.log("[ICE] ✅ Remote ICE candidate added successfully");
    } catch (error) {
      console.error("[ICE] ❌ Error adding remote ICE candidate:", error);
    }
  }

  /**
   * Gửi answer lên AppServer qua REST API
   */
  private async sendAnswerToApi(
    peerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    if (!this.apiBaseUrl) {
      throw new Error("apiBaseUrl not set");
    }

    try {
      const answerUrl = `${this.apiBaseUrl}/api/peer/${peerId}/answer`;
      console.log(`[API] 📤 Sending answer to: ${answerUrl}`);
      console.log(
        `[API] Answer type: ${answer.type}, SDP length: ${answer.sdp?.length}`
      );

      const res = await fetch(answerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });

      if (!res.ok) {
        throw new Error(`Send answer failed: ${res.status} ${res.statusText}`);
      }

      console.log("[API] ✅ Answer sent successfully");
    } catch (error) {
      console.error("[API] ❌ Error sending answer:", error);
      throw error;
    }
  }

  /**
   * Subscribe đến các sự kiện từ AppServer qua STOMP
   * Backend gửi message đến /queue/peers/{peerId} khi có peer mới tham gia
   */
  private subscribeToSignaling(): void {
    if (!this.stompClient) return;
    console.log("[STOMP] ✅ Subscribed to signaling channel");
  }

  /**
   * Subscribe channel theo peerId để nhận event từ SFU khi có peer mới tham gia
   * Backend gửi đến /queue/peers/{peerId} với format ClientMessage
   */
  private subscribeToPeerChannel(peerId: string): void {
    if (!this.stompClient || !this.stompClient.connected) {
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

    this.peerSubscription = this.stompClient.subscribe(
      channel,
      (message: { body: string }) => {
        try {
          const clientMessage = JSON.parse(message.body) as ClientMessage;
          console.log("[STOMP] 📨 Received message:", clientMessage);

          switch (clientMessage.event) {
            case "sfu-offer": {
              console.log("📩 RAW OFFER:", clientMessage.data);

              // Backend gửi offer trực tiếp trong data, hoặc trong data.offer
              let offer: RTCSessionDescriptionInit | undefined;

              if ("type" in clientMessage.data && "sdp" in clientMessage.data) {
                // data chính là offer
                offer = clientMessage.data as RTCSessionDescriptionInit;
              } else if ("offer" in clientMessage.data) {
                // offer nằm trong data.offer
                offer = clientMessage.data.offer;
              }

              if (offer && offer.type === "offer" && offer.sdp) {
                this.handleOfferFromSFU(peerId, offer); // peerId đã có ở tầng subscribe
              } else {
                console.error(
                  "[STOMP] ❌ Invalid sfu-offer message:",
                  clientMessage
                );
              }
              break;
            }

            case "sfu-candidate": {
              // Format: { event: "sfu-candidate", data: { candidate } }
              if (clientMessage.data.candidate) {
                this.handleRemoteCandidate(clientMessage.data.candidate);
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
    if (this.localStream) return this.localStream;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      console.log("[WebRTC] ✅ Local stream acquired");
      return this.localStream;
    } catch (error) {
      console.error("[WebRTC] ❌ Error getting local stream:", error);
      throw error;
    }
  }

  /**
   * Tham gia phòng - Gửi join-room event
   */
  async joinRoom(): Promise<void> {
    if (!this.stompClient?.connected) {
      throw new Error("STOMP client not connected");
    }

    const payload = {
      event: "join-room",
      roomId: this.config.roomId,
      userId: this.config.userId,
    };

    console.log("[WebRTC] Sending join-room:", payload);

    this.stompClient.publish({
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

    this.pc = new RTCPeerConnection(config);

    // 🔥 FIX: Xử lý khi nhận được remote track - tránh duplicate streams
    this.pc.ontrack = (event: RTCTrackEvent) => {
      const trackKind = event.track.kind;
      const peerId = this.peerId || "unknown";

      console.log(
        `[WebRTC] 📹 Remote ${trackKind} track received from peer ${peerId}`
      );

      if (event.streams[0]) {
        const stream = event.streams[0];
        const streamId = stream.id;

        // Kiểm tra nếu stream đã tồn tại trong Map
        if (this.remoteStreams.has(streamId)) {
          console.log(
            `[WebRTC] ✅ Track added to existing stream ${streamId} (${trackKind})`
          );
          // Stream đã tồn tại, chỉ cần track được thêm vào tự động
          // Không cần gọi callback lại
        } else {
          // Stream mới, thêm vào Map và gọi callback
          console.log(
            `[WebRTC] 🆕 New remote stream ${streamId} from peer ${peerId}`
          );
          this.remoteStreams.set(streamId, stream);
          this.config.onRemoteStreamAdded?.(stream, peerId);
        }
      }
    };

    // Xử lý ICE Candidate - gửi lên App Server qua REST API
    this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        const candidate = event.candidate;
        console.log("[ICE] 🧊 Local ICE candidate generated");
        console.log("[ICE] Candidate:", {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        });

        if (this.peerId && this.apiBaseUrl) {
          // Gọi async method nhưng không await (fire and forget)
          this.sendCandidateToApi(this.peerId, candidate).catch((err) => {
            console.error("[ICE] ❌ Error sending candidate:", err);
          });
        } else {
          console.warn(
            "[ICE] ⚠️ Cannot send candidate: peerId or apiBaseUrl missing"
          );
        }
      } else {
        console.log("[ICE] ✅ All ICE candidates gathered");
      }
    };

    // Theo dõi trạng thái kết nối
    this.pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state:", this.pc?.connectionState);
      if (this.pc?.connectionState) {
        this.config.onConnectionStateChange?.(this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log(
        "[WebRTC] ICE connection state:",
        this.pc?.iceConnectionState
      );
      if (this.pc?.iceConnectionState) {
        this.config.onIceConnectionStateChange?.(this.pc.iceConnectionState);
      }
    };

    console.log("[WebRTC] ✅ RTCPeerConnection created");
  }

  /**
   * Gửi ICE Candidate lên AppServer qua REST API
   * Mỗi khi client thu thập được ICE candidate, gọi API này để chuyển tiếp lên SFU
   */
  private async sendCandidateToApi(
    peerId: string,
    candidate: RTCIceCandidate
  ): Promise<void> {
    if (!this.apiBaseUrl || !peerId) {
      console.warn(
        "[ICE] ⚠️ Cannot send candidate: apiBaseUrl or peerId missing"
      );
      return;
    }

    try {
      const candidateJson = candidate.toJSON();
      const candidateUrl = `${this.apiBaseUrl}/api/peer/${peerId}/candidate`;

      console.log(`[API] 📤 Sending ICE candidate to: ${candidateUrl}`);

      // Body theo format AddCandidateRequest: { candidate: { candidate, sdpMid, sdpMLineIndex } }
      const res = await fetch(candidateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (this.pc) {
        this.pc.close();
        this.pc = null;
        console.log("[WebRTC] ✅ PeerConnection closed");
      }
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = null;
        console.log("[WebRTC] ✅ Local media streams stopped");
      }
      return;
    }

    // 1. Gọi REST API xóa peer trên App Server
    if (this.apiBaseUrl) {
      try {
        const url = `${this.apiBaseUrl}/api/peer/${this.peerId}`;
        console.log(`[API] 🗑️ Deleting peer: ${url}`);

        const res = await fetch(url, { method: "DELETE" });
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

    // 2. Unsubscribe STOMP channel
    if (this.peerSubscription) {
      this.peerSubscription.unsubscribe();
      this.peerSubscription = null;
      console.log("[STOMP] ✅ Unsubscribed from peer channel");
    }

    // 3. Disconnect STOMP
    if (this.stompClient?.connected) {
      console.log("[STOMP] 🔌 Disconnecting STOMP...");
      this.stompClient.deactivate();
      this.stompClient = null;
      console.log("[STOMP] ✅ Disconnected");
    }

    // 4. Đóng PeerConnection
    if (this.pc) {
      console.log("[WebRTC] 🔧 Closing PeerConnection...");
      this.pc.close();
      this.pc = null;
      console.log("[WebRTC] ✅ PeerConnection closed");
    }

    // 5. Dừng local media streams
    if (this.localStream) {
      console.log("[WebRTC] 🎥 Stopping local media streams...");
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`[WebRTC] ✅ Stopped ${track.kind} track`);
      });
      this.localStream = null;
      console.log("[WebRTC] ✅ Local media streams stopped");
    }

    // 6. 🔥 FIX: Clear remote streams Map
    this.remoteStreams.clear();
    console.log("[WebRTC] ✅ Remote streams cleared");

    this.peerId = null;
    console.log("[WebRTC] ✅ Left room successfully");
  }

  /**
   * Disconnect STOMP connection
   */
  disconnect(): void {
    if (this.stompClient?.connected) {
      this.stompClient.deactivate();
    }
  }

  /**
   * Lấy local stream
   */
  getLocal(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Lấy RTCPeerConnection
   */
  getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  /**
   * Toggle audio
   */
  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Toggle video
   */
  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }
}
