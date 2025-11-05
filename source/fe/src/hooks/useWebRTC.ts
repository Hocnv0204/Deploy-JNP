/**
 * useWebRTC Hook - React hook cho WebRTC Manager
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { WebRTCManager } from "../services/webrtcManager";

export interface UseWebRTCConfig {
  signalingUrl: string;
  roomId: string;
  userId: string;
}

export interface UseWebRTCState {
  isConnected: boolean;
  isConnecting: boolean;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  error: Error | null;
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
}

export function useWebRTC(config: UseWebRTCConfig) {
  const managerRef = useRef<WebRTCManager | null>(null);
  const [state, setState] = useState<UseWebRTCState>({
    isConnected: false,
    isConnecting: false,
    localStream: null,
    remoteStreams: new Map(),
    error: null,
    connectionState: null,
    iceConnectionState: null,
  });

  /**
   * Khởi tạo WebRTCManager và kết nối signaling
   */
  const initWebRTC = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isConnecting: true, error: null }));

      // Tạo manager
      const manager = new WebRTCManager({
        signalingUrl: config.signalingUrl,
        roomId: config.roomId,
        userId: config.userId,
        onRemoteStreamAdded: (stream, peerId) => {
          console.log("[useWebRTC] Remote stream added:", peerId);
          setState((prev) => {
            const newRemoteStreams = new Map(prev.remoteStreams);
            newRemoteStreams.set(peerId, stream);
            return { ...prev, remoteStreams: newRemoteStreams };
          });
        },
        onRemoteStreamRemoved: (peerId) => {
          console.log("[useWebRTC] Remote stream removed:", peerId);
          setState((prev) => {
            const newRemoteStreams = new Map(prev.remoteStreams);
            newRemoteStreams.delete(peerId);
            return { ...prev, remoteStreams: newRemoteStreams };
          });
        },
        onConnectionStateChange: (state) => {
          setState((prev) => ({ ...prev, connectionState: state }));
        },
        onIceConnectionStateChange: (state) => {
          setState((prev) => ({ ...prev, iceConnectionState: state }));
        },
      });

      managerRef.current = manager;

      // Khởi tạo signaling
      await manager.initSignaling();

      // Lấy local stream
      const localStream = await manager.getLocalStream();

      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        localStream,
      }));

      return manager;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({
        ...prev,
        error,
        isConnecting: false,
      }));
      throw error;
    }
  }, [config.signalingUrl, config.roomId, config.userId]);

  /**
   * Tham gia phòng
   */
  const joinRoom = useCallback(async () => {
    if (!managerRef.current) {
      throw new Error("WebRTC not initialized");
    }

    try {
      await managerRef.current.joinRoom();
      console.log("[useWebRTC] ✅ Joined room:", config.roomId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({ ...prev, error }));
      throw error;
    }
  }, [config.roomId]);

  /**
   * Rời phòng
   */
  const leaveRoom = useCallback(async () => {
    if (!managerRef.current) return;

    try {
      await managerRef.current.leaveRoom();
      console.log("[useWebRTC] ✅ Left room");
      setState((prev) => ({
        ...prev,
        localStream: null,
        remoteStreams: new Map(),
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({ ...prev, error }));
    }
  }, []);

  /**
   * Toggle audio
   */
  const toggleAudio = useCallback((enabled: boolean) => {
    managerRef.current?.toggleAudio(enabled);
  }, []);

  /**
   * Toggle video
   */
  const toggleVideo = useCallback((enabled: boolean) => {
    managerRef.current?.toggleVideo(enabled);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
      }
    };
  }, []);

  return {
    state,
    initWebRTC,
    joinRoom,
    leaveRoom,
    toggleAudio,
    toggleVideo,
    manager: managerRef.current,
  };
}
