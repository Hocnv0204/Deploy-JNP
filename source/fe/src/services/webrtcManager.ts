/**
 * WebRTC Manager - Quản lý RTCPeerConnection và media streams
 * Kết nối với STOMP backend (Spring Boot)
 */
import { Client as StompClient } from "@stomp/stompjs";
import { getAccessToken, getUsernameFromToken } from "../utils/auth";
import { API_BASE_URL } from "../utils/constants";
export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
  signalingUrl: string;
  roomId: string;
  userId: string;
  apiBaseUrl?: string;
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

  // ✅ Map peerId -> username để hiển thị tên người dùng
  private peerUsernames: Map<string, string> = new Map();

  // ✅ Track current source peer ID để biết track từ peer nào
  private currentSourcePeerId: string | null = null;

  constructor(config: WebRTCConfig) {
    this.config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
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

    const createUrl = `${this.apiBaseUrl}/api/peer/create-with-username`;
    console.log(`[API] 📤 Creating peer: ${createUrl}`);
    const token = getAccessToken();
    const username = getUsernameFromToken();

    if (!username) {
      throw new Error("Username not found in token");
    }

    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        roomId: this.config.roomId,
        webhookUrl: webhookUrl || `${API_BASE_URL}/sfu-webhook`,
        username: username,
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

    // ✅ Lưu map peerId -> username
    this.peerUsernames.set(data.peerId, data.username);

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
        console.log(`[WebRTC] 🔧 Creating PeerConnection for peer: ${peerId}`);
        this.createPeerConnection();
        if (this.localStream) {
          console.log(`[WebRTC] 📤 Adding local tracks to PeerConnection...`);
          this.localStream.getTracks().forEach((track) => {
            if (this.pc && this.localStream) {
              console.log(`[WebRTC] ✅ Added ${track.kind} track to PC`, {
                trackId: track.id,
                enabled: track.enabled,
                label: track.label,
              });
              this.pc.addTrack(track, this.localStream);
            }
          });
          console.log(`[WebRTC] 📤 All local tracks added to PeerConnection`);
        }
      }

      if (!this.pc) {
        throw new Error("PeerConnection not initialized");
      }

      // đặt remote offer
      console.log(
        `[WebRTC] 📥 Setting remote offer from SFU for peer: ${peerId}`
      );
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log(`[WebRTC] ✅ Remote offer set successfully`);

      // tạo answer
      console.log(`[WebRTC] 🔧 Creating answer for peer: ${peerId}`);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log(`[WebRTC] ✅ Local answer set successfully`);

      // gửi answer về server qua endpoint /api/peer/{peerId}/answer
      // App Server sẽ chuyển tiếp answer này lên SFU
      // Body theo format SetAnswerRequest: { answer: { type, sdp } }
      const answerUrl = `${this.apiBaseUrl}/api/peer/${peerId}/answer`;
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
    const peerId = this.peerId || "unknown";
    const username = this.peerUsernames.get(peerId) || peerId;

    console.log("[ICE] 📨 ========== RECEIVED REMOTE ICE CANDIDATE ==========");
    console.log(`[ICE] 📨 From Peer: ${peerId} (${username})`);
    console.log("[ICE] 📨 Raw candidate data:", candidateData);

    if (!this.pc) {
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

      await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
      console.log("[ICE] ✅ Remote ICE candidate added successfully");
      console.log("[ICE] ✅ Candidate can now be used for connectivity checks");
    } catch (error) {
      console.error("[ICE] ❌ Error adding remote ICE candidate:", error);
    }
    console.log("[ICE] 📨 ================================================");
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
          console.log(
            `[WebRTC] 📹 Using only available peer: ${sourceUsername}`
          );
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
          console.log(
            `[WebRTC] ⚠️ Stream ${streamId} already exists - SKIPPING`
          );
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
    };

    // Xử lý ICE Candidate - gửi lên App Server qua REST API
    this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
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

        if (this.peerId && this.apiBaseUrl) {
          console.log("[ICE] 🧊 📤 Sending candidate to SFU via API...");
          // Gọi async method nhưng không await (fire and forget)
          this.sendCandidateToApi(this.peerId, candidate).catch((err) => {
            console.error("[ICE] ❌ Error sending candidate:", err);
          });
        } else {
          console.warn(
            "[ICE] ⚠️ Cannot send candidate: peerId or apiBaseUrl missing"
          );
        }
        console.log(
          "[ICE] 🧊 ================================================"
        );
      } else {
        console.log(
          "[ICE] ✅ ========== ALL ICE CANDIDATES GATHERED =========="
        );
        console.log("[ICE] ✅ ICE gathering complete - ready for connection");
        console.log(
          "[ICE] ✅ ================================================"
        );
      }
    };

    // Theo dõi trạng thái kết nối
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      const peerId = this.peerId || "unknown";
      const username = this.peerUsernames.get(peerId) || peerId;

      console.log(`[WebRTC] 🔌 ========== CONNECTION STATE CHANGED ==========`);
      console.log(`[WebRTC] 🔌 Peer: ${peerId} (${username})`);
      console.log(`[WebRTC] 🔌 New State: ${state?.toUpperCase()}`);

      switch (state) {
        case "connecting":
          console.log(`[WebRTC] 🔌 ⏳ Connecting to peer...`);
          break;
        case "connected":
          console.log(`[WebRTC] 🔌 ✅ CONNECTED! Peers are now connected!`);
          console.log(`[WebRTC] 🔌 ✅ Media can now flow between peers`);
          break;
        case "disconnected":
          console.log(`[WebRTC] 🔌 ⚠️ Disconnected from peer`);
          break;
        case "failed":
          console.log(`[WebRTC] 🔌 ❌ Connection FAILED`);
          break;
        case "closed":
          console.log(`[WebRTC] 🔌 🚪 Connection closed`);
          break;
      }
      console.log(`[WebRTC] 🔌 =======================================`);

      if (this.pc?.connectionState) {
        this.config.onConnectionStateChange?.(this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      const peerId = this.peerId || "unknown";
      const username = this.peerUsernames.get(peerId) || peerId;

      console.log(
        `[WebRTC] 🧊 ========== ICE CONNECTION STATE CHANGED ==========`
      );
      console.log(`[WebRTC] 🧊 Peer: ${peerId} (${username})`);
      console.log(`[WebRTC] 🧊 New State: ${state?.toUpperCase()}`);

      switch (state) {
        case "checking":
          console.log(`[WebRTC] 🧊 ⏳ Checking ICE connectivity...`);
          break;
        case "connected":
          console.log(
            `[WebRTC] 🧊 ✅ ICE CONNECTED! Direct connection established!`
          );
          break;
        case "completed":
          console.log(`[WebRTC] 🧊 ✅ ICE COMPLETED! All checks done!`);
          break;
        case "disconnected":
          console.log(`[WebRTC] 🧊 ⚠️ ICE disconnected`);
          break;
        case "failed":
          console.log(`[WebRTC] 🧊 ❌ ICE connection FAILED`);
          break;
        case "closed":
          console.log(`[WebRTC] 🧊 🚪 ICE connection closed`);
          break;
      }
      console.log(
        `[WebRTC] 🧊 =================================================`
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
