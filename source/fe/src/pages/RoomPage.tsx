import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";
import ParticipantsList from "../components/ParticipantsList";
// import { WebRTCManager } from "../services/webrtcManager";
import { useParams } from "react-router-dom";
import { API_BASE_URL, WS_ENDPOINTS } from "../utils/constants";
import { WebRTCManager } from "../services/webrtc";

interface Participant {
  id: string;
  name: string;
  isActive: boolean;
}

interface CurrentUser {
  username: string;
  fullName: string;
  loginTime: string;
}

interface RemoteStream {
  username: string; // ✅ Bây giờ chứa username thay vì peerId
  stream: MediaStream;
}

export default function RoomPage() {
  const navigate = useNavigate();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true); // ✅ State chờ kết nối
  const { roomId } = useParams();

  const [remoteStreams, setRemoteStreams] = useState<Map<string, RemoteStream>>(
    new Map()
  );
  const MAX_DISPLAY_PARTICIPANTS = 12; // Giới hạn hiển thị tối đa 12 người (3x4 grid)

  useEffect(() => {
    if (!currentUser || !roomId) return;

    // ✅ Kiểm tra xem user là host (tạo phòng) hay guest (tham gia phòng)
    const currentRoomStr = localStorage.getItem("currentRoom");
    const currentRoom = currentRoomStr ? JSON.parse(currentRoomStr) : null;
    const isHost = currentRoom?.isHost === true;

    // ✅ Timeout khác nhau: 
    // - Host (tạo phòng): Không cần timeout vì sẽ tắt loading ngay sau khi join room thành công
    // - Guest (tham gia): Timeout 10 giây để đảm bảo có đủ thời gian kết nối
    let connectionTimeout: number | null = null;
    if (!isHost) {
      connectionTimeout = window.setTimeout(() => {
        console.warn("⚠️ [RoomPage] Guest - Connection timeout - forcing ready state");
        setIsConnecting(false);
      }, 10000); // Guest: 10 giây
    }

    // instantiate manager and keep a reference for control from UI handlers
    const manager = new WebRTCManager({
      signalingUrl: WS_ENDPOINTS.STOMP, // URL backend STOMP
      roomId: roomId,
      userId: currentUser.username,
      apiBaseUrl: API_BASE_URL,          // ✅ Thêm dòng này


      // ✅ Callback khi kết nối đã sẵn sàng
      onConnectionReady: () => {
        console.log("🎉 [RoomPage] Connection ready! Hiding loading screen...");
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        setIsConnecting(false);
      },

      // Khi nhận remote stream (từ người khác)
      onRemoteStreamAdded: (stream, username) => {
        const streamId = stream.id;
        console.log(
          `📹 [RoomPage] ========== REMOTE STREAM ADDED ==========`
        );
        console.log(
          `📹 [RoomPage] Username: ${username}, Stream ID: ${streamId}`
        );
        console.log(
          `📹 [RoomPage] Stream tracks: ${stream.getTracks().length} (${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video)`
        );

        // ✅ BẢO VỆ: Kiểm tra duplicate TRƯỚC KHI thêm vào state
        setRemoteStreams((prev) => {
          // ✅ Guard 1: Kiểm tra xem stream.id đã tồn tại trong Map chưa
          if (prev.has(streamId)) {
            console.warn(
              `⚠️ [RoomPage] Stream ${streamId} already exists in Map - SKIPPING duplicate`
            );
            return prev; // Không thêm duplicate
          }

          // ✅ Guard 2: Kiểm tra xem stream object đã tồn tại chưa (double check)
          const existingByStream = Array.from(prev.values()).find(
            (entry) => entry.stream === stream || entry.stream.id === streamId
          );

          if (existingByStream) {
            console.warn(
              `⚠️ [RoomPage] Stream object already exists - SKIPPING duplicate`
            );
            console.warn(
              `⚠️ [RoomPage] Existing: ${existingByStream.username}, New: ${username}`
            );
            return prev; // Không thêm duplicate
          }

          // ✅ Guard 3: Validate stream có tracks hợp lệ
          if (!stream || stream.getTracks().length === 0) {
            console.warn(
              `⚠️ [RoomPage] Stream has no tracks - SKIPPING invalid stream`
            );
            return prev;
          }

          // ✅ Tất cả checks đều pass - thêm stream mới
          console.log(
            `✅ [RoomPage] Adding NEW stream: streamId=${streamId}, username=${username}`
          );
          const newMap = new Map(prev);
          newMap.set(streamId, { username, stream });
          console.log(
            `✅ [RoomPage] Total remote streams: ${newMap.size}`
          );
          console.log(
            `📹 [RoomPage] ==========================================`
          );
          return newMap;
        });
      },
      onRemoteStreamRemoved: (streamId) => {
        console.log("📹 Remote stream removed", streamId);
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.delete(streamId);
          return newMap;
        });
      },
    });

    managerRef.current = manager;

    (async () => {
      try {
        // console.log("[RoomPage] 🔄 Initializing STOMP...");
        // await manager.initSignaling(); // ✅ WebSocket for signaling

        // console.log("[RoomPage] 🚪 Joining signaling room...");
        // await manager.joinRoom(); // ✅ Inform AppServer "tôi đã vào phòng"

        // const stream = await manager.getLocalStream();
        const stream =  manager.getLocal() || null;
        console.log("[RoomPage] 📹 Local stream acquired");

        // Đảm bảo local video hiển thị
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true; // Muted để tránh feedback
          try {
            await localVideoRef.current.play();
            console.log("[RoomPage] ✅ Local video playing");
            setIsVideoOn(true);
          } catch (e) {
            console.error("[RoomPage] ❌ Error playing local video:", e);
          }
        }

        // REST API flow – create peer, receive offer, send answer
        // const webhookUrl = `${API_BASE_URL}/sfu-webhook`;
        console.log("[RoomPage] 🌐 Creating peer via API...");
        await manager.joinRoomViaApi();

        // ✅ Nếu là host (tạo phòng), tắt loading ngay sau khi join room thành công
        if (isHost) {
          console.log("✅ [RoomPage] Host - Room joined successfully, hiding loading immediately...");
          setIsConnecting(false);
        }
        // Guest sẽ đợi onConnectionReady callback hoặc timeout 10 giây
      } catch (error) {
        console.error("[RoomPage] ❌ Error initializing:", error);
        // Nếu có lỗi, vẫn tắt loading để user thấy được
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        setIsConnecting(false);
      }
    })();

    return () => {
      // Cleanup
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      try {
        manager.leaveRoom();
      } catch (e) {
        console.warn("Error leaving room:", e);
      }

      // Clear remote streams
      setRemoteStreams(new Map());

      managerRef.current = null;
    };
  }, [currentUser, roomId]);

  // Update local video khi stream thay đổi
  useEffect(() => {
    if (managerRef.current && localVideoRef.current) {
      const localStream = managerRef.current.getLocal();
      if (localStream && localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(console.error);
      }
    }
  }, [isVideoOn]);

  // Lấy danh sách remote streams để hiển thị (giới hạn MAX_DISPLAY_PARTICIPANTS)
  const displayStreams = Array.from(remoteStreams.values()).slice(
    0,
    MAX_DISPLAY_PARTICIPANTS - 1
  );
  const totalParticipants = 1 + displayStreams.length; // 1 local + remote streams

  // Check user login
  useEffect(() => {
    const user = localStorage.getItem("currentUser");
    if (!user) {
      navigate("/login");
      return;
    }
    const userData = JSON.parse(user) as CurrentUser;
    setCurrentUser(userData);

    // Initialize participants with current user only
    setParticipants([
      { id: userData.username, name: userData.fullName, isActive: true },
    ]);
  }, [navigate]);

  // Timer for call duration
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Toggle audio via manager when user clicks mic
  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    // manager toggle expects enabled boolean
    managerRef.current?.toggleAudio(!newMuted);
  };

  // Toggle video via manager when user clicks camera
  const toggleVideo = () => {
    const newVideoOn = !isVideoOn;
    setIsVideoOn(newVideoOn);
    managerRef.current?.toggleVideo(newVideoOn);
  };

  const handleEndCall = () => {
    if (confirm("Bạn có chắc muốn kết thúc cuộc họp?")) {
      // Navigate back to home
      navigate("/");
    }
  };

  if (!currentUser) {
    return (
      <div className="w-full min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Đang tải...</div>
      </div>
    );
  }

  // ✅ Màn hình chờ kết nối
  if (isConnecting) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex flex-col items-center justify-center">
        <div className="bg-gray-800/50 backdrop-blur-lg border border-gray-700 rounded-2xl p-12 max-w-md w-full mx-4">
          {/* Icon Animation */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-5xl">🔗</span>
              </div>
              <div className="absolute inset-0 w-24 h-24 bg-blue-600/30 rounded-full animate-ping"></div>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Đang kết nối...
          </h2>

          {/* Description */}
          <p className="text-gray-300 text-center mb-6">
            Đang thiết lập kết nối với các thiết bị khác
          </p>

          {/* Loading Progress */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300">Kết nối WebSocket</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300">Trao đổi ICE candidates</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300">Đang kết nối với peer...</span>
            </div>
          </div>

          {/* Room Info */}
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Phòng:</span>
              <span className="text-white font-semibold">{roomId}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 px-6 py-3.5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            {roomId ? `Phòng ${roomId}` : "Phòng họp"}
          </h1>
          <div className="hidden sm:flex items-center gap-2">
            <div className="bg-gray-800/60 px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300 flex items-center gap-1.5">
              <span>⏱️</span>
              <span>{formatDuration(callDuration)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleEndCall}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg"
        >
          Thoát
        </button>
      </header>

      {/* ✅ MAIN: CÁC Ô VIDEO NHỎ GỌN + HÌNH VUÔNG + KHÔNG SCROLL */}
      <main className="flex-1 flex items-center justify-center overflow-hidden bg-gradient-to-b from-gray-900 to-gray-950 p-6">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            width: "100%",
            maxWidth: "1100px",
            maxHeight: "80vh",
          }}
        >
          {/* ✅ LOCAL VIDEO */}
          <div className="relative aspect-square">
            <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700/50 w-full h-full shadow-lg hover:shadow-xl transition-all duration-200">
              {isVideoOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                  <span className="text-4xl">👤</span>
                  <p className="text-gray-300 text-xs font-medium mt-1">
                    {currentUser?.fullName || "Bạn"}
                  </p>
                </div>
              )}
            </div>

            {/* NAME TAG */}
            <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-md text-[10px] font-medium">
              {currentUser?.fullName || "Bạn"}
            </div>
          </div>

          {/* ✅ REMOTE VIDEOS - TỰ THU NHỎ + HÌNH VUÔNG */}
          {displayStreams.map(({ username, stream }, index) => (
            <div key={`${username}-${index}`} className="relative aspect-square">
              <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700/40 w-full h-full shadow-lg">
                <video
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (el && el.srcObject !== stream) {
                      el.srcObject = stream;
                      el.play().catch(() => {});
                    }
                  }}
                  className="object-cover w-full h-full"
                />
              </div>

              <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded-md text-[10px] font-medium">
                {username}
              </div>
            </div>
          ))}

          {/* ✅ SLOT TRỐNG */}
          {totalParticipants < MAX_DISPLAY_PARTICIPANTS &&
            Array.from({
              length: MAX_DISPLAY_PARTICIPANTS - totalParticipants,
            }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-square bg-gray-800/10 rounded-xl border border-dashed border-gray-700/30 flex items-center justify-center"
              >
                <div className="text-center text-gray-500 text-xs">
                  ⏳ Chờ tham gia
                </div>
              </div>
            ))}
        </div>

        {/* ✅ NOTIFICATION IF TOO MANY */}
        {remoteStreams.size >= MAX_DISPLAY_PARTICIPANTS && (
          <div className="absolute bottom-24 bg-yellow-900/40 border border-yellow-500/40 px-3 py-1 rounded-md text-xs text-yellow-300">
            Đang hiển thị {MAX_DISPLAY_PARTICIPANTS} người đầu tiên
          </div>
        )}

        {/* CONTROL BAR */}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-gray-900/95 backdrop-blur-lg px-4 py-3 rounded-full flex items-center gap-2 shadow-2xl border border-gray-800/50">
            <button
              onClick={toggleMute}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                isMuted ? "bg-red-600" : "bg-gray-800"
              }`}
            >
              {isMuted ? "🔇" : "🎤"}
            </button>

            <button
              onClick={toggleVideo}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                !isVideoOn ? "bg-red-600" : "bg-gray-800"
              }`}
            >
              📹
            </button>

            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                isChatOpen ? "bg-green-600" : "bg-gray-800"
              }`}
            >
              💬
            </button>

            <button
              onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
              className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center"
            >
              👥
            </button>

            <button
              onClick={handleEndCall}
              className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg"
            >
              📞
            </button>
          </div>
        </div>
      </main>

      {/* PANELS */}
      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentUserName="Bạn"
      />
      <ParticipantsList
        isOpen={isParticipantsOpen}
        onClose={() => setIsParticipantsOpen(false)}
        participants={participants}
      />
    </div>
  );
}