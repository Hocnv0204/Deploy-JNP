/**
 * WebRTCRoom Component - Example sử dụng useWebRTC hook
 * Đây là ví dụ cách tích hợp WebRTC vào RoomPage
 */

import { useEffect, useRef } from "react";
import { useWebRTC } from "../hooks/useWebRTC";

interface WebRTCRoomProps {
  roomId: string;
  userId: string;
  signalingUrl: string;
}

export function WebRTCRoom({ roomId, userId, signalingUrl }: WebRTCRoomProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const { state, initWebRTC, joinRoom, leaveRoom, toggleAudio, toggleVideo } =
    useWebRTC({
      signalingUrl,
      roomId,
      userId,
    });

  /**
   * Khởi tạo WebRTC khi component mount
   */
  useEffect(() => {
    const init = async () => {
      try {
        await initWebRTC();
      } catch (err) {
        console.error("[WebRTCRoom] Failed to init WebRTC:", err);
      }
    };

    init();
  }, [initWebRTC]);

  /**
   * Hiển thị local stream
   */
  useEffect(() => {
    if (state.localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = state.localStream;
    }
  }, [state.localStream]);

  /**
   * Hiển thị remote streams
   */
  useEffect(() => {
    state.remoteStreams.forEach((stream, peerId) => {
      let videoElement = remoteVideosRef.current.get(peerId);

      if (!videoElement) {
        // Tạo video element mới cho remote stream
        videoElement = document.createElement("video");
        videoElement.id = `remote-${peerId}`;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.style.width = "100%";
        videoElement.style.height = "100%";
        videoElement.style.objectFit = "cover";

        const container = document.getElementById("remote-videos-container");
        if (container) {
          container.appendChild(videoElement);
        }

        remoteVideosRef.current.set(peerId, videoElement);
      }

      videoElement.srcObject = stream;
    });

    // Xóa video elements cho streams bị loại bỏ
    remoteVideosRef.current.forEach((videoElement, peerId) => {
      if (!state.remoteStreams.has(peerId)) {
        videoElement.remove();
        remoteVideosRef.current.delete(peerId);
      }
    });
  }, [state.remoteStreams]);

  /**
   * Xử lý join room
   */
  const handleJoinRoom = async () => {
    try {
      await joinRoom();
    } catch (err) {
      console.error("[WebRTCRoom] Failed to join room:", err);
    }
  };

  /**
   * Xử lý leave room
   */
  const handleLeaveRoom = async () => {
    try {
      await leaveRoom();
    } catch (err) {
      console.error("[WebRTCRoom] Failed to leave room:", err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🎥 WebRTC Room</h1>
            <p className="text-gray-400">
              Room: {roomId} | User: {userId}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="text-sm">
              <p>Connection: {state.connectionState || "disconnected"}</p>
              <p>ICE: {state.iceConnectionState || "disconnected"}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-900 text-red-100 p-4 m-4 rounded">
          ❌ Error: {state.error.message}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 flex gap-4">
        {/* Local Video */}
        <div className="flex-1 bg-gray-800 rounded-lg overflow-hidden">
          <div className="relative w-full h-full">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover bg-black"
            />
            <div className="absolute bottom-2 left-2 bg-green-600 px-2 py-1 rounded text-sm">
              📹 Your Video
            </div>
          </div>
        </div>

        {/* Remote Videos */}
        <div className="flex-1 flex flex-col gap-2">
          <div
            id="remote-videos-container"
            className="flex-1 grid grid-cols-2 gap-2 overflow-auto"
          >
            {/* Remote videos will be added here dynamically */}
          </div>
        </div>
      </main>

      {/* Controls */}
      <div className="bg-gray-800 p-4 border-t border-gray-700 flex gap-3 justify-center">
        {!state.isConnected ? (
          <button
            onClick={handleJoinRoom}
            disabled={state.isConnecting}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            {state.isConnecting ? "⏳ Connecting..." : "✅ Join Room"}
          </button>
        ) : (
          <>
            <button
              onClick={() => toggleAudio(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              🎤 Mic On
            </button>
            <button
              onClick={() => toggleAudio(false)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              🔇 Mic Off
            </button>
            <button
              onClick={() => toggleVideo(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              📹 Camera On
            </button>
            <button
              onClick={() => toggleVideo(false)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              🚫 Camera Off
            </button>
            <button
              onClick={handleLeaveRoom}
              className="px-6 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-lg transition-colors"
            >
              ☎️ Leave Room
            </button>
          </>
        )}
      </div>

      {/* Status Bar */}
      <footer className="bg-gray-900 p-2 text-center text-xs text-gray-400 border-t border-gray-700">
        {state.isConnecting
          ? "🔄 Initializing WebRTC..."
          : state.isConnected
          ? `✅ Connected | Remote Participants: ${state.remoteStreams.size}`
          : "❌ Not Connected"}
      </footer>
    </div>
  );
}
