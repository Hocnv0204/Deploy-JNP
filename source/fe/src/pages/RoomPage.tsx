import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import VideoStream from "../components/VideoStream";
import JoinNotification from "../components/JoinNotification";
import ChatPanel from "../components/ChatPanel";
import ParticipantsList from "../components/ParticipantsList";

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

export default function RoomPage() {
  const navigate = useNavigate();
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
    <div className="w-full min-h-screen bg-gray-900 text-white p-4 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700 max-sm:mb-4 max-sm:pb-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold max-md:text-xl max-sm:text-lg">
            🎥 Phòng họp
          </h1>
          <div className="bg-gray-700 px-3 py-1 rounded-full text-sm font-mono">
            ⏱️ {formatDuration(callDuration)}
          </div>
          {currentRoom?.isHost && (
            <div className="bg-green-700/30 border border-green-600 px-3 py-1 rounded-full text-sm font-mono">
              🔐 Mã: {currentRoom.code}
            </div>
          )}
        </div>
        <div className="flex gap-3 max-sm:gap-2">
          <button
            onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm max-sm:px-3 max-sm:py-1.5 max-sm:text-xs font-medium"
          >
            👥 {participants.length}
          </button>
          <button
            onClick={handleEndCall}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm max-sm:px-3 max-sm:py-1.5 max-sm:text-xs font-medium"
          >
            ☎️ Thoát
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-6 max-md:gap-4 max-sm:gap-3 min-h-0">
        {/* Video Grid */}
        <div className="grid grid-cols-2 gap-4 flex-1 max-md:gap-3 max-sm:grid-cols-1 max-sm:gap-2 overflow-hidden">
          {/* Main Video - Your Camera */}
          <div className="col-span-2 bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center max-sm:col-span-1 max-sm:aspect-square relative group max-sm:order-2">
            {isVideoOn ? (
              <>
                <VideoStream isVideoOn={isVideoOn} isMuted={isMuted} />
                <div className="absolute top-3 left-3 bg-red-600 px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                  🔴 Đang phát trực tiếp
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="text-6xl mb-4 max-md:text-5xl max-sm:text-4xl">
                  �
                </div>
                <p className="text-gray-400 text-sm max-md:text-xs">
                  Camera của bạn đang tắt
                </p>
              </div>
            )}
            {/* Mic indicator */}
            <div className="absolute bottom-3 right-3 bg-gray-800/80 px-3 py-1 rounded-full flex items-center gap-2">
              <span
                className={`text-lg ${
                  isMuted ? "text-red-500" : "text-green-500"
                }`}
              >
                {isMuted ? "🔇" : "🎤"}
              </span>
              <span className="text-xs text-gray-300">
                {isMuted ? "Tắt âm" : "Đang nói"}
              </span>
            </div>
          </div>

          {/* Participant Videos */}
          {participants.length > 1 && (
            <>
              {participants.slice(1, 5).map((participant) => (
                <div
                  key={participant.id}
                  className="bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center hover:ring-2 hover:ring-blue-600 transition-all relative group"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2 max-md:text-3xl">👤</div>
                    <p className="text-gray-300 text-xs font-medium">
                      {participant.name}
                    </p>
                  </div>
                  {/* Status indicator */}
                  <div className="absolute top-2 right-2">
                    {participant.isActive ? (
                      <span className="inline-flex h-3 w-3 rounded-full bg-green-600 animate-pulse" />
                    ) : (
                      <span className="inline-flex h-3 w-3 rounded-full bg-gray-600" />
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Empty state when only one person */}
          {participants.length <= 1 && (
            <div className="bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center hover:ring-2 hover:ring-blue-600 transition-all">
              <div className="text-center">
                <div className="text-4xl mb-2">⏳</div>
                <p className="text-gray-400 text-xs">
                  Chờ người khác tham gia...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 pb-2 max-md:gap-3 max-sm:gap-2 flex-wrap">
          {/* Mic Button */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-3 rounded-full transition-all max-md:p-2.5 max-sm:p-2 ${
              isMuted
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
          >
            {isMuted ? "🔇" : "🎤"}
          </button>

          {/* Camera Button */}
          <button
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`p-3 rounded-full transition-all max-md:p-2.5 max-sm:p-2 ${
              isVideoOn
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={isVideoOn ? "Tắt camera" : "Bật camera"}
          >
            {isVideoOn ? "�" : "📷"}
          </button>

          {/* Screen Share Button */}
          <button
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`p-3 rounded-full transition-all max-md:p-2.5 max-sm:p-2 ${
              isScreenSharing
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={
              isScreenSharing ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"
            }
          >
            🖥️
          </button>

          {/* Chat Button */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-3 rounded-full transition-all max-md:p-2.5 max-sm:p-2 ${
              isChatOpen
                ? "bg-green-600 hover:bg-green-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
            title="Chat"
          >
            💬
          </button>

          {/* End Call Button */}
          <button
            onClick={handleEndCall}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700 transition-all max-md:p-2.5 max-sm:p-2"
            title="Kết thúc cuộc họp"
          >
            ☎️
          </button>
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
