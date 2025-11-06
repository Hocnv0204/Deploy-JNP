// signaling.js
// WebSocket client quản lý signaling giữa FE và AppServer (chuyển tiếp đến SFU)

export class SignalingClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.alive = false;
    this.reconnectDelay = 1500;
    this.heartbeatInterval = 10000;
    this.queue = [];
    this.handlers = new Map();
    this.heartbeatTimer = null;
  }

  /**
   * Đăng ký callback cho một loại event nhất định.
   * @param {string} event - tên sự kiện, ví dụ: "message" hoặc "open"
   * @param {function} callback - hàm xử lý
   */
  on(event, callback) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(callback);
    return () => this.handlers.get(event)?.delete(callback);
  }

  emit(event, payload) {
    const cbs = this.handlers.get(event);
    if (!cbs) return;
    for (const cb of cbs) cb(payload);
  }

  /**
   * Kết nối WebSocket với AppServer
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const ws = this.ws;

      ws.onopen = () => {
        console.log("[Signaling] ✅ Connected:", this.url);
        this.alive = true;
        this.flushQueue();
        this.startHeartbeat();
        this.emit("open");
        resolve();
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this.emit("message", msg);
        } catch (err) {
          console.error("[Signaling] ❌ Invalid JSON:", e.data);
        }
      };

      ws.onclose = () => {
        console.warn("[Signaling] 🔁 Connection closed, retrying...");
        this.alive = false;
        this.stopHeartbeat();
        setTimeout(() => this.reconnect(), this.reconnectDelay);
      };

      ws.onerror = (err) => {
        console.error("[Signaling] ❌ Error:", err);
        ws.close();
        reject(err);
      };
    });
  }

  /**
   * Gửi dữ liệu qua socket (auto queue nếu chưa open)
   */
  send(data) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.queue.push(payload);
    }
  }

  /**
   * Gửi JSON an toàn (auto stringify)
   */
  safeSend(obj) {
    this.send(JSON.stringify(obj));
  }

  /**
   * Flush lại các message bị queue khi chưa connect xong
   */
  flushQueue() {
    while (this.queue.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.queue.shift());
    }
  }

  /**
   * Gửi heartbeat định kỳ để giữ kết nối
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.alive && this.ws?.readyState === WebSocket.OPEN) {
        this.safeSend({ event: "ping", ts: Date.now() });
      }
    }, this.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Tự động reconnect
   */
  reconnect() {
    if (this.alive) return;
    console.log("[Signaling] 🔄 Reconnecting...");
    this.connect().catch(() => {
      setTimeout(() => this.reconnect(), this.reconnectDelay);
    });
  }

  /**
   * Ngắt kết nối thủ công
   */
  close() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    this.alive = false;
  }
}

// ======= Cách dùng mẫu =======
// const signaling = new SignalingClient("ws://localhost:8080/ws");
// await signaling.connect();
// signaling.on("message", (msg) => console.log(msg));
// signaling.safeSend({ event: "join-room", roomId: "room123", username: "hocnv" });
