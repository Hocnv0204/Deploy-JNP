/**
 * MediaHandler - Quản lý local media streams
 * Từ file webrtcManager.ts: method getLocalStream, toggleAudio, toggleVideo
 */
export class MediaHandler {
  private localStream: MediaStream | null = null;

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

  /**
   * Dừng local media streams
   */
  stopLocalStream(): void {
    if (this.localStream) {
      console.log("[WebRTC] 🎥 Stopping local media streams...");
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`[WebRTC] ✅ Stopped ${track.kind} track`);
      });
      this.localStream = null;
      console.log("[WebRTC] ✅ Local media streams stopped");
    }
  }

  /**
   * Lấy local stream
   */
  getStream(): MediaStream | null {
    return this.localStream;
  }
}
