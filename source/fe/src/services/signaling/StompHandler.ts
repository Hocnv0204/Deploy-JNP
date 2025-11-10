import { Client as StompClient } from "@stomp/stompjs";

/**
 * StompHandler - Quản lý kết nối STOMP với App Server (Spring Boot WebSocket)
 * Từ file webrtcManager.ts: method connectStomp, disconnect
 */
export class StompHandler {
  private stompClient: InstanceType<typeof StompClient> | null = null;
  private signalingUrl: string;

  constructor(signalingUrl: string) {
    this.signalingUrl = signalingUrl;
  }

  /**
   * Kết nối STOMP WebSocket
   * Sử dụng @stomp/stompjs để kết nối với App Server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("[STOMP] 🔌 Connecting to:", this.signalingUrl);

      // Nếu BE dùng withSockJS() ở endpoint "/websocket", khi dùng WebSocket thuần
      // cần nối thêm "/websocket" vào cuối để thành đường dẫn native WS
      const wsBase = this.signalingUrl.replace(/^http/, "ws");
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
   * Disconnect STOMP connection
   */
  disconnect(): void {
    if (this.stompClient?.connected) {
      console.log("[STOMP] 🔌 Disconnecting STOMP...");
      this.stompClient.deactivate();
      this.stompClient = null;
      console.log("[STOMP] ✅ Disconnected");
    }
  }

  /**
   * Getter cho client — dùng trong WebRTCManager
   * Ví dụ:
   *   this.stomp.client?.subscribe("/queue/peers/{id}", callback)
   */
  get client(): InstanceType<typeof StompClient> | null {
    return this.stompClient;
  }

  /**
   * Kiểm tra xem STOMP client đã kết nối chưa
   */
  get connected(): boolean {
    return this.stompClient?.connected || false;
  }
}
