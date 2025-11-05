import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { SignalingClient } from "../services/signaling";

export function useWebRTC({ username, roomId, signalingUrl }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStream = useRef(null);
  const pc = useRef(null);

  const [peerId, setPeerId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // === 1️⃣ Tạo signaling client dùng lại được ===
  const signaling = useMemo(
    () => new SignalingClient(signalingUrl),
    [signalingUrl]
  );

  // === 2️⃣ Khi FE mount, connect WS và join room ===
  useEffect(() => {
    let unsub = () => {};
    signaling
      .connect()
      .then(() => {
        signaling.safeSend({ event: "join-room", roomId, username });
      })
      .catch(console.error);

    // Đăng ký callback khi nhận message WS
    unsub = signaling.on("message", async (data) => {
      console.log("[Signaling ⇐]", data);
      switch (data.event) {
        case "sfu-offer":
          await handleOffer(data);
          break;
        case "sfu-candidate":
          await handleRemoteCandidate(data);
          break;
        case "peer-joined":
          console.log("👥 Peer joined:", data.peerId);
          break;
        case "peer-left":
          console.log("🚪 Peer left:", data.peerId);
          break;
        default:
          break;
      }
    });

    return () => {
      unsub();
      signaling.close();
    };
  }, [signaling, roomId, username]);

  // === 3️⃣ Tạo RTCPeerConnection ===
  const createPeerConnection = useCallback(async () => {
    pc.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // ICE candidate local → gửi AppServer
    pc.current.onicecandidate = (e) => {
      if (e.candidate && peerId) {
        signaling.safeSend({
          event: "sfu-candidate",
          peerId,
          candidate: e.candidate,
        });
      }
    };

    // Nhận track remote → gán vào thẻ video
    pc.current.ontrack = (e) => {
      const [remoteStream] = e.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    // Lấy camera + mic local
    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStream.current.getTracks().forEach((track) => {
      pc.current.addTrack(track, localStream.current);
    });

    if (localVideoRef.current)
      localVideoRef.current.srcObject = localStream.current;

    setIsConnected(true);
  }, [peerId, signaling]);

  // === 4️⃣ Xử lý khi nhận Offer từ SFU ===
  const handleOffer = async ({ peerId: id, offer }) => {
    setPeerId(id);

    if (!pc.current) await createPeerConnection();

    await pc.current.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);

    signaling.safeSend({
      event: "sfu-answer",
      peerId: id,
      answer,
    });
  };

  // === 5️⃣ Xử lý ICE candidate từ SFU ===
  const handleRemoteCandidate = async ({ candidate }) => {
    try {
      await pc.current?.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("[ICE] Failed to add remote candidate:", err);
    }
  };

  // === 6️⃣ Rời phòng ===
  const leaveRoom = useCallback(() => {
    if (peerId) signaling.safeSend({ event: "leave-room", peerId });
    if (pc.current) pc.current.close();
    if (localStream.current)
      localStream.current.getTracks().forEach((t) => t.stop());
    setIsConnected(false);
  }, [peerId, signaling]);

  return {
    localVideoRef,
    remoteVideoRef,
    isConnected,
    joinRoom: createPeerConnection,
    leaveRoom,
  };
}
