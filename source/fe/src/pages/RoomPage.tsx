import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
// Local <video> element is used to show the camera via ref
import JoinNotification from "../components/JoinNotification";
import ChatPanel from "../components/ChatPanel";
import ParticipantsList from "../components/ParticipantsList";
import { WebRTCManager } from "../services/webrtcManager";

// Component để hiển thị remote video - giống Google Meet
function RemoteVideo({
  peerId,
  stream,
  name,
  isMuted,
}: {
  peerId: string;
  stream: MediaStream;
  name?: string;
  isMuted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  }, [stream]);

  return (
    <div className="relative w-full h-full group">
      <div className="bg-gray-800 rounded-2xl overflow-hidden aspect-square w-full h-full shadow-md hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      </div>
      {/* Tên người ở bottom-left - giống Google Meet */}
      <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs text-white font-medium shadow-lg">
        {name || `Peer ${peerId.substring(0, 8)}`}
      </div>
      {/* Mic indicator ở top-right */}
      <div className="absolute top-3 right-3">
        <div
          className={`bg-black/40 backdrop-blur-sm p-2 rounded-full shadow-lg ${
            isMuted ? "text-red-400" : "text-green-400"
          }`}
        >
          <span className="text-sm">{isMuted ? "🔇" : "🎤"}</span>
        </div>
      </div>
    </div>
  );
}

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

interface CurrentRoom {
  code: string;
  isHost: boolean;
  joinedAt: string;
}

interface RemoteStream {
  peerId: string;
  stream: MediaStream;
}

export default function RoomPage() {
  const navigate = useNavigate();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [currentRoom, setCurrentRoom] = useState<CurrentRoom | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [showJoinNotification, setShowJoinNotification] = useState(true);
  const [joinRequestName, setJoinRequestName] = useState("Nguyễn Văn A");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, RemoteStream>>(
    new Map()
  );
  const MAX_DISPLAY_PARTICIPANTS = 12; // Giới hạn hiển thị tối đa 12 người (3x4 grid)

  useEffect(() => {
    if (!currentUser || !currentRoom) return;
    // instantiate manager and keep a reference for control from UI handlers
    const manager = new WebRTCManager({
      signalingUrl: "http://localhost:8081/websocket", // URL backend STOMP
      roomId: currentRoom.code,
      userId: currentUser.username,

      // Khi nhận remote stream (từ người khác)
      onRemoteStreamAdded: (stream, peerId) => {
        console.log("📹 Remote stream from", peerId);
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(peerId, { peerId, stream });
          return newMap;
        });
      },
      onRemoteStreamRemoved: (peerId) => {
        console.log("📹 Remote stream removed", peerId);
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.delete(peerId);
          return newMap;
        });
      },
    });

    managerRef.current = manager;

    (async () => {
      try {
        console.log("[RoomPage] 🔄 Initializing STOMP...");
        await manager.initSignaling(); // ✅ WebSocket for signaling

        console.log("[RoomPage] 🚪 Joining signaling room...");
        await manager.joinRoom(); // ✅ Inform AppServer "tôi đã vào phòng"

        const stream = await manager.getLocalStream(); // ✅ Webcam
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
        const webhookUrl = "http://localhost:8081/sfu-webhook";
        console.log("[RoomPage] 🌐 Creating peer via API...");
        await manager.joinRoomViaApi("http://localhost:8081", webhookUrl);
      } catch (error) {
        console.error("[RoomPage] ❌ Error initializing:", error);
      }
    })();

    return () => {
      // Cleanup
      try {
        manager.leaveRoom();
      } catch (e) {
        console.warn("Error leaving room:", e);
      }

      // Clear remote streams
      setRemoteStreams(new Map());

      managerRef.current = null;
    };
  }, [currentUser, currentRoom]);

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

  // Tính toán grid layout dựa trên số lượng người (giống Google Meet)
  const calculateGridLayout = (totalParticipants: number) => {
    if (totalParticipants === 1) return "grid-cols-1";
    if (totalParticipants === 2) return "grid-cols-2";
    if (totalParticipants <= 4) return "grid-cols-2";
    if (totalParticipants <= 9) return "grid-cols-3";
    if (totalParticipants <= 12) return "grid-cols-4"; // 3x4 grid như Google Meet
    return "grid-cols-4";
  };

  // Lấy danh sách remote streams để hiển thị (giới hạn MAX_DISPLAY_PARTICIPANTS)
  const displayStreams = Array.from(remoteStreams.values()).slice(
    0,
    MAX_DISPLAY_PARTICIPANTS - 1
  );
  const totalParticipants = 1 + displayStreams.length; // 1 local + remote streams
  const gridCols = calculateGridLayout(totalParticipants);

  // Helper để map peerId với participant name
  const getParticipantName = (peerId: string): string => {
    // Tìm trong participants list hoặc dùng placeholder
    const participant = participants.find((p) => p.id === peerId);
    if (participant) return participant.name;

    // Fallback: dùng tên từ danh sách participants nếu có
    const randomIndex = peerId.charCodeAt(0) % participants.length;
    return participants[randomIndex]?.name || `Peer ${peerId.substring(0, 8)}`;
  };

  // Check user login and initialize participants
  useEffect(() => {
    const user = localStorage.getItem("currentUser");
    if (!user) {
      navigate("/login");
      return;
    }
    const userData = JSON.parse(user) as CurrentUser;
    setCurrentUser(userData);

    // Get current room info
    const room = localStorage.getItem("currentRoom");
    if (room) {
      setCurrentRoom(JSON.parse(room) as CurrentRoom);
    }

    // Initialize participants with current user
    setParticipants([
      { id: "1", name: userData.fullName, isActive: true },
      { id: "2", name: "Nguyễn Văn B", isActive: true },
      { id: "3", name: "Trần Thị C", isActive: false },
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

  const handleAcceptJoin = () => {
    setParticipants([
      ...participants,
      { id: Date.now().toString(), name: joinRequestName, isActive: true },
    ]);
    // Simulate next join request after 10 seconds
    setTimeout(() => {
      const names = ["Phạm Minh D", "Lê Quốc E", "Hoàng Kim F"];
      const randomName = names[Math.floor(Math.random() * names.length)];
      setJoinRequestName(randomName);
      setShowJoinNotification(true);
    }, 10000);
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

  const handleRejectJoin = () => {
    console.log(`Rejected ${joinRequestName}`);
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

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Header - Modern Google Meet Style */}
      <header className="sticky top-0 z-30 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 px-6 py-3.5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            {currentRoom?.code ? `Phòng ${currentRoom.code}` : "Phòng họp"}
          </h1>
          <div className="hidden sm:flex items-center gap-2">
            <div className="bg-gray-800/60 px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300 flex items-center gap-1.5">
              <span>⏱️</span>
              <span>{formatDuration(callDuration)}</span>
            </div>
            {currentRoom?.isHost && (
              <div className="bg-green-900/30 border border-green-700/40 px-3 py-1.5 rounded-lg text-xs text-green-300 font-medium flex items-center gap-1.5">
                <span>🔐</span>
                <span>Mã: {currentRoom.code}</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleEndCall}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg"
        >
          Thoát
        </button>
      </header>

      {/* Main Content - Video Grid */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gradient-to-b from-gray-900 to-gray-950 p-4">
        {/* Video Grid - Responsive 3x4 grid */}
        <div
          className={`grid ${gridCols} gap-4 flex-1 min-h-0 w-full max-w-7xl mx-auto`}
          style={{ gridAutoRows: "minmax(0, 1fr)" }}
        >
          {/* Local Video - Your Camera */}
          <div className="relative w-full h-full group">
            <div className="bg-gray-800 rounded-2xl overflow-hidden aspect-square w-full h-full shadow-md hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02]">
              {isVideoOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4 w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                  <div className="text-6xl mb-3">👤</div>
                  <p className="text-gray-300 text-sm font-medium">
                    {currentUser?.fullName || "Bạn"}
                  </p>
                </div>
              )}
            </div>
            {/* Tên người ở bottom-left - giống Google Meet */}
            <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs text-white font-medium shadow-lg">
              {currentUser?.fullName || "Bạn"}
            </div>
            {/* Mic indicator ở top-right */}
            <div className="absolute top-3 right-3">
              <div
                className={`bg-black/40 backdrop-blur-sm p-2 rounded-full shadow-lg ${
                  isMuted ? "text-red-400" : "text-green-400"
                }`}
              >
                <span className="text-sm">{isMuted ? "🔇" : "🎤"}</span>
              </div>
            </div>
          </div>

          {/* Remote Video Streams */}
          {displayStreams.map(({ peerId, stream }) => (
            <RemoteVideo
              key={peerId}
              peerId={peerId}
              stream={stream}
              name={getParticipantName(peerId)}
              isMuted={false}
            />
          ))}

          {/* Empty slots khi chưa đủ người */}
          {totalParticipants < MAX_DISPLAY_PARTICIPANTS && (
            <>
              {Array.from({
                length: MAX_DISPLAY_PARTICIPANTS - totalParticipants,
              }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="bg-gray-800/20 rounded-2xl aspect-square flex items-center justify-center border-2 border-dashed border-gray-700/40 w-full h-full transition-all duration-200 hover:border-gray-600/60"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2 text-gray-600 opacity-50">
                      ⏳
                    </div>
                    <p className="text-gray-500 text-xs font-medium">
                      Chờ người tham gia
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Thông báo khi có quá nhiều người */}
          {remoteStreams.size >= MAX_DISPLAY_PARTICIPANTS && (
            <div className="col-span-full bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 text-center mt-2">
              <p className="text-yellow-300 text-sm">
                ⚠️ Đang hiển thị {MAX_DISPLAY_PARTICIPANTS} người đầu tiên. Tổng
                cộng {remoteStreams.size + 1} người trong phòng.
              </p>
            </div>
          )}
        </div>

        {/* Bottom Control Bar - Centered Google Meet Style */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-gray-900/90 backdrop-blur-lg px-6 py-4 rounded-full flex items-center gap-3 shadow-2xl border border-gray-800/50">
            {/* Main controls */}
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center ${
                isMuted
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-gray-800 hover:bg-gray-700 text-white"
              }`}
              title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
            >
              <span className="text-xl">{isMuted ? "🔇" : "🎤"}</span>
            </button>

            <button
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center ${
                !isVideoOn
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-gray-800 hover:bg-gray-700 text-white"
              }`}
              title={isVideoOn ? "Tắt camera" : "Bật camera"}
            >
              <span className="text-xl">{isVideoOn ? "📹" : "📷"}</span>
            </button>

            <button
              onClick={() => setIsScreenSharing(!isScreenSharing)}
              className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center ${
                isScreenSharing
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-800 hover:bg-gray-700 text-white"
              }`}
              title={
                isScreenSharing ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"
              }
            >
              <span className="text-xl">🖥️</span>
            </button>

            <div className="w-px h-8 bg-gray-700 mx-1"></div>

            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center ${
                isChatOpen
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-gray-800 hover:bg-gray-700 text-white"
              }`}
              title="Chat"
            >
              <span className="text-xl">💬</span>
            </button>

            <button
              onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
              className="w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-all duration-200 flex items-center justify-center"
              title="Danh sách người tham gia"
            >
              <span className="text-xl">👥</span>
            </button>

            <div className="w-px h-8 bg-gray-700 mx-1"></div>

            {/* End Call Button - Red */}
            <button
              onClick={handleEndCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-200 flex items-center justify-center shadow-lg"
              title="Kết thúc cuộc họp"
            >
              <span className="text-2xl">📞</span>
            </button>
          </div>
        </div>
      </main>

      {/* Join Notification */}
      <JoinNotification
        userName={joinRequestName}
        onAccept={handleAcceptJoin}
        onReject={handleRejectJoin}
        visible={showJoinNotification}
      />

      {/* Chat Panel */}
      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentUserName="Bạn"
      />

      {/* Participants List */}
      <ParticipantsList
        isOpen={isParticipantsOpen}
        onClose={() => setIsParticipantsOpen(false)}
        participants={participants}
      />
    </div>
  );
}
