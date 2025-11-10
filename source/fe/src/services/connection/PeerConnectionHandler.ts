/**
 * PeerConnectionHandler - Quản lý RTCPeerConnection và các event handlers
 * Từ file webrtcManager.ts: method createPeerConnection và tất cả event handlers
 */
export class PeerConnectionHandler {
  private pc: RTCPeerConnection;

  constructor(
    config: RTCConfiguration,
    callbacks: {
      onTrack?: (event: RTCTrackEvent) => void;
      onIceCandidate?: (event: RTCPeerConnectionIceEvent) => void;
      onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
      onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
      onConnectionReady?: () => void;
    }
  ) {
    this.pc = new RTCPeerConnection(config);
    this.setupEventHandlers(callbacks);
    console.log("[WebRTC] ✅ RTCPeerConnection created");
  }

  /**
   * Setup tất cả event handlers cho PeerConnection
   */
  private setupEventHandlers(callbacks: {
    onTrack?: (event: RTCTrackEvent) => void;
    onIceCandidate?: (event: RTCPeerConnectionIceEvent) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
    onConnectionReady?: () => void;
  }): void {
    // Xử lý khi nhận được remote track
    if (callbacks.onTrack) {
      this.pc.ontrack = callbacks.onTrack;
    }

    // Xử lý ICE Candidate
    if (callbacks.onIceCandidate) {
      this.pc.onicecandidate = callbacks.onIceCandidate;
    }

    // Theo dõi trạng thái kết nối
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state) {
        console.log(`[WebRTC] 🔌 ========== CONNECTION STATE CHANGED ==========`);
        console.log(`[WebRTC] 🔌 New State: ${state.toUpperCase()}`);

        switch (state) {
          case "connecting":
            console.log(`[WebRTC] 🔌 ⏳ Connecting to peer...`);
            break;
          case "connected":
            console.log(`[WebRTC] 🔌 ✅ CONNECTED! Peers are now connected!`);
            console.log(`[WebRTC] 🔌 ✅ Media can now flow between peers`);
            // ✅ Trigger callback khi kết nối sẵn sàng
            callbacks.onConnectionReady?.();
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

        callbacks.onConnectionStateChange?.(state);
      }
    };

    // Theo dõi ICE connection state
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      if (state) {
        console.log(
          `[WebRTC] 🧊 ========== ICE CONNECTION STATE CHANGED ==========`
        );
        console.log(`[WebRTC] 🧊 New State: ${state.toUpperCase()}`);

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

        callbacks.onIceConnectionStateChange?.(state);
      }
    };
  }

  /**
   * Thêm local tracks vào PeerConnection
   * Kiểm tra xem track đã tồn tại chưa để tránh lỗi "A sender already exists for the track"
   */
  addLocalStream(stream: MediaStream): void {
    if (!stream) {
      console.warn("[WebRTC] ⚠️ Cannot add empty stream");
      return;
    }

    if (!this.pc) {
      console.warn("[WebRTC] ⚠️ PeerConnection not initialized");
      return;
    }

    console.log(`[WebRTC] 📤 Adding local tracks to PeerConnection...`);
    
    // Lấy danh sách các track đã có trong PC
    const existingSenders = this.pc.getSenders();
    const existingTrackIds = new Set(
      existingSenders
        .map((sender) => sender.track?.id)
        .filter((id): id is string => id !== undefined && id !== null)
    );

    stream.getTracks().forEach((track) => {
      // Kiểm tra xem track đã được thêm chưa
      if (existingTrackIds.has(track.id)) {
        console.log(
          `[WebRTC] ⚠️ Track ${track.kind} (${track.id}) already exists in PC - SKIPPING`
        );
        return;
      }

      try {
        console.log(`[WebRTC] ✅ Adding ${track.kind} track to PC`, {
          trackId: track.id,
          enabled: track.enabled,
          label: track.label,
        });
        this.pc.addTrack(track, stream);
      } catch (error) {
        console.error(
          `[WebRTC] ❌ Error adding ${track.kind} track:`,
          error
        );
      }
    });
    console.log(`[WebRTC] 📤 Local tracks processing completed`);
  }

  /**
   * Đặt remote description (offer từ SFU)
   */
  async setRemoteDescription(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      throw new Error("PeerConnection not initialized");
    }

    console.log(`[WebRTC] 📥 Setting remote offer from SFU`);
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log(`[WebRTC] ✅ Remote offer set successfully`);
  }

  /**
   * Tạo answer và set local description
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new Error("PeerConnection not initialized");
    }

    console.log(`[WebRTC] 🔧 Creating answer`);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    console.log(`[WebRTC] ✅ Local answer set successfully`);
    return answer;
  }

  /**
   * Thêm remote ICE candidate
   */
  async addIceCandidate(candidateInit: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      throw new Error("PeerConnection not initialized");
    }

    await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
  }

  /**
   * Đóng PeerConnection
   */
  close(): void {
    if (this.pc) {
      console.log("[WebRTC] 🔧 Closing PeerConnection...");
      this.pc.close();
      console.log("[WebRTC] ✅ PeerConnection closed");
    }
  }

  /**
   * Getter cho PeerConnection instance
   */
  get connection(): RTCPeerConnection {
    return this.pc;
  }

  /**
   * Kiểm tra xem PeerConnection đã được tạo chưa
   */
  get isInitialized(): boolean {
    return this.pc !== null;
  }
}
