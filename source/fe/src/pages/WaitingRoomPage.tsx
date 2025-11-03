import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

interface CurrentUser {
  username: string;
  fullName: string;
  loginTime: string;
}

export default function WaitingRoomPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [waitingTime, setWaitingTime] = useState(0);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const user = localStorage.getItem("currentUser");
    if (!user) {
      navigate("/login");
      return;
    }
    setCurrentUser(JSON.parse(user));

    // Get room code from search params
    const code = searchParams.get("room");
    if (!code) {
      navigate("/");
      return;
    }
    setRoomCode(code);
  }, [navigate, searchParams]);

  // Simulate waiting for host approval
  useEffect(() => {
    if (!isApproved) {
      const timer = setInterval(() => {
        setWaitingTime((prev) => prev + 1);

        // Simulate host approval after 3-5 seconds (in real app, this would be from server/websocket)
        if (Math.random() < 0.1 && waitingTime > 2) {
          setIsApproved(true);
          clearInterval(timer);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [waitingTime, isApproved]);

  // Navigate to room when approved
  useEffect(() => {
    if (isApproved) {
      const timer = setTimeout(() => {
        // Store room info in localStorage
        const currentRoom = {
          code: roomCode,
          isHost: false,
          joinedAt: new Date().toISOString(),
        };
        localStorage.setItem("currentRoom", JSON.stringify(currentRoom));
        navigate("/room");
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isApproved, roomCode, navigate]);

  const handleCancel = () => {
    navigate("/");
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex flex-col items-center justify-center p-4">
      {/* Container */}
      <div className="w-full max-w-md">
        {isApproved ? (
          // Approved State
          <div className="bg-gray-800 border border-green-700 rounded-lg shadow-2xl p-8 text-center">
            <div className="text-6xl mb-4 animate-bounce">✅</div>
            <h2 className="text-3xl font-bold text-green-400 mb-2">
              Đã Được Phê Duyệt!
            </h2>
            <p className="text-gray-300 mb-6">
              Chủ phòng đã chấp nhận yêu cầu của bạn
            </p>
            <p className="text-sm text-gray-400">
              Chuyển hướng đến phòng họp...
            </p>
            <div className="mt-6 flex justify-center">
              <div className="animate-spin text-2xl">⏳</div>
            </div>
          </div>
        ) : (
          // Waiting State
          <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="text-6xl mb-4 animate-pulse">🔔</div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Chờ Xác Nhận
              </h1>
              <p className="text-gray-400">
                Đang chờ chủ phòng xác nhận yêu cầu của bạn...
              </p>
            </div>

            {/* Room Info Card */}
            <div className="bg-gray-700/50 rounded-lg p-6 mb-8 space-y-4">
              {/* Room Code */}
              <div>
                <p className="text-gray-400 text-sm mb-2">Mã phòng họp</p>
                <div className="bg-gray-800 border border-gray-600 rounded px-4 py-3 font-mono text-white text-center tracking-widest">
                  {roomCode}
                </div>
              </div>

              {/* User Info */}
              <div>
                <p className="text-gray-400 text-sm mb-2">Người tham gia</p>
                <p className="text-white font-medium">{currentUser.fullName}</p>
              </div>

              {/* Waiting Time */}
              <div>
                <p className="text-gray-400 text-sm mb-2">Thời gian chờ</p>
                <p className="text-white font-mono text-lg">{waitingTime}s</p>
              </div>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                <span className="text-sm text-gray-300">
                  Chờ chủ phòng xác nhận
                </span>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg px-4 py-3 mb-8">
              <p className="text-blue-200 text-sm">
                💡 <strong>Mẹo:</strong> Hãy chắc chắn rằng mã phòng là chính
                xác. Chủ phòng sẽ nhận được thông báo về yêu cầu của bạn.
              </p>
            </div>

            {/* Cancel Button */}
            <button
              onClick={handleCancel}
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              Hủy Yêu Cầu
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-gray-500 text-sm mt-8">
        © 2025 Meeting App - Chờ xác nhận
      </p>
    </div>
  );
}
