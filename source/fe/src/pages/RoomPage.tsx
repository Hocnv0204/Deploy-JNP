import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
// Local <video> element is used to show the camera via ref
import JoinNotification from "../components/JoinNotification";
import ChatPanel from "../components/ChatPanel";
import ParticipantsList from "../components/ParticipantsList";
import { WebRTCManager } from "../services/webrtcManager";
import { useParams } from "react-router-dom";
import { WS_ENDPOINTS, API_ENDPOINTS } from "../utils/constants";
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
    <div className="relative w-full aspect-square group">
      <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700/50 w-full h-full shadow-lg hover:shadow-xl hover:border-gray-600/60 transition-all duration-200">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      </div>
      {/* Tên người ở bottom-left */}
      <div className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded-md text-[11px] text-white font-medium shadow-md max-w-[calc(100%-1rem)] truncate">
        {name || `Peer ${peerId.substring(0, 8)}`}
      </div>
      {/* Mic indicator ở top-right */}
      <div className="absolute top-2 right-2">
        <div
          className={`bg-black/65 backdrop-blur-sm p-1.5 rounded-full shadow-md ${
            isMuted ? "text-red-400" : "text-green-400"
          }`}
        >
          <span className="text-xs">{isMuted ? "🔇" : "🎤"}</span>
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

interface RemoteStream {
  peerId: string;
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
  const [showJoinNotification, setShowJoinNotification] = useState(true);
  const [joinRequestName, setJoinRequestName] = useState("Nguyễn Văn A");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const { roomId } = useParams();

  const [remoteStreams, setRemoteStreams] = useState<Map<string, RemoteStream>>(
    new Map()
  );
  const MAX_DISPLAY_PARTICIPANTS = 12; // Giới hạn hiển thị tối đa 12 người (3x4 grid)

  useEffect(() => {
    if (!currentUser || !roomId) return;
    // instantiate manager and keep a reference for control from UI handlers
    const manager = new WebRTCManager({
      signalingUrl: WS_ENDPOINTS.STOMP, // URL backend STOMP
      roomId: roomId,
      userId: currentUser.username,

      // Khi nhận remote stream (từ người khác)
      onRemoteStreamAdded: (stream, peerId) => {
        const streamId = stream.id;
        console.log(
          `📹 [RoomPage] Remote stream from peer ${peerId}, streamId: ${streamId}`
        );

        // 🔥 FIX: Kiểm tra duplicate dựa trên stream.id thực tế
        setRemoteStreams((prev) => {
          // Kiểm tra xem stream.id đã tồn tại chưa
          const existingEntry = Array.from(prev.values()).find(
            (entry) => entry.stream.id === streamId
          );

          if (existingEntry) {
            console.log(
              `⚠️ [RoomPage] Stream ${streamId} already exists, skipping duplicate`
            );
            return prev; // Không thêm duplicate
          }

          // Stream mới, thêm vào Map
          console.log(
            `✅ [RoomPage] Adding NEW stream ${streamId} for peer ${peerId}`
          );
          const newMap = new Map(prev);
          newMap.set(streamId, { peerId, stream }); // 🔥 Dùng streamId làm key
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

  // Tính toán grid layout dựa trên số lượng người (tối ưu hiển thị tất cả trên 1 màn hình)
  const calculateGridLayout = (totalParticipants: number) => {
    if (totalParticipants === 1) return "grid-cols-1";
    if (totalParticipants === 2) return "grid-cols-2";
    if (totalParticipants <= 4) return "grid-cols-2";
    if (totalParticipants <= 9) return "grid-cols-3";
    if (totalParticipants <= 12) return "grid-cols-4";
    return "grid-cols-4"; // Giới hạn tối đa 4 cột
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
            {roomId?.isHost && (
              <div className="bg-green-900/30 border border-green-700/40 px-3 py-1.5 rounded-lg text-xs text-green-300 font-medium flex items-center gap-1.5">
                <span>🔐</span>
                <span>Mã: {roomId}</span>
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
          {displayStreams.map(({ peerId, stream }) => (
            <div key={peerId} className="relative aspect-square">
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
                {getParticipantName(peerId)}
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
      <JoinNotification
        visible={showJoinNotification}
        userName={joinRequestName}
        onAccept={handleAcceptJoin}
        onReject={handleRejectJoin}
      />
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
