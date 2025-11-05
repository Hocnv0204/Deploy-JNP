import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import JoinRoomModal from "../components/JoinRoomModal";

interface CurrentUser {
  username: string;
  fullName: string;
  loginTime: string;
}

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in
    const user = localStorage.getItem("currentUser");
    if (!user) {
      navigate("/login");
      return;
    }
    setCurrentUser(JSON.parse(user));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("currentUser");
    navigate("/login");
  };

  const handleCreateRoom = () => {
    // Create a new room with a unique code
    const roomCode =
      "ROOM" + Math.random().toString(36).substring(2, 8).toUpperCase();

    // Save room to localStorage
    const rooms = JSON.parse(localStorage.getItem("meetingRooms") || "[]");
    rooms.push({
      code: roomCode,
      hostName: currentUser?.fullName,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("meetingRooms", JSON.stringify(rooms));

    // Save current room info
    const currentRoom = {
      code: roomCode,
      isHost: true,
      joinedAt: new Date().toISOString(),
    };
    localStorage.setItem("currentRoom", JSON.stringify(currentRoom));

    navigate("/room");
  };

  const handleJoinRoom = () => {
    setIsJoinModalOpen(true);
  };

  const handleJoinRoomSubmit = (roomCode: string) => {
    setIsJoinModalOpen(false);
  
    // Save current joined room
    const currentRoom = {
      code: roomCode,
      isHost: false,
      joinedAt: new Date().toISOString(),
    };
    localStorage.setItem("currentRoom", JSON.stringify(currentRoom));
  
    // Navigate to RoomPage directly (không cần waiting-room)
    navigate("/room");
  };
  

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Header */}
      <header className="bg-gray-800/80 backdrop-blur border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🎥</span>
              <h1 className="text-2xl font-bold text-white">Meeting App</h1>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              🚪 Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Welcome Section */}
        <div className="text-center mb-16">
          <div className="text-6xl mb-4">👋</div>
          <h2 className="text-5xl font-bold text-white mb-4">
            Xin chào, {currentUser.fullName}!
          </h2>
          <p className="text-xl text-gray-300 mb-12">
            Chào mừng bạn đến với Meeting App - Nền tảng họp video trực tuyến
          </p>

          {/* Main Action Buttons */}
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-12">
            {/* Create Room Button */}
            <button
              onClick={handleCreateRoom}
              className="group flex flex-col items-center justify-center gap-3 px-8 py-8 bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold rounded-lg transition-all transform hover:scale-105 hover:shadow-2xl shadow-lg"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">
                ➕
              </span>
              <span className="text-2xl">Tạo Phòng Họp</span>
              <span className="text-sm text-green-200 group-hover:text-white">
                Khởi tạo phòng mới
              </span>
            </button>

            {/* Join Room Button */}
            <button
              onClick={handleJoinRoom}
              className="group flex flex-col items-center justify-center gap-3 px-8 py-8 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-lg transition-all transform hover:scale-105 hover:shadow-2xl shadow-lg"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">
                �
              </span>
              <span className="text-2xl">Tham Gia Phòng</span>
              <span className="text-sm text-blue-200 group-hover:text-white">
                Tham gia cuộc họp
              </span>
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Features */}
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-lg p-8">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-xl font-bold text-white mb-4">Tính Năng</h3>
            <ul className="text-gray-300 space-y-2">
              <li>✓ Video call HD</li>
              <li>✓ Chat realtime</li>
              <li>✓ Screen sharing</li>
              <li>✓ Multiple participants</li>
            </ul>
          </div>

          {/* Security */}
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-lg p-8">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold text-white mb-4">An Toàn</h3>
            <ul className="text-gray-300 space-y-2">
              <li>✓ Encrypted connections</li>
              <li>✓ User authentication</li>
              <li>✓ Private rooms</li>
              <li>✓ Data protection</li>
            </ul>
          </div>

          {/* Easy to Use */}
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-lg p-8">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-bold text-white mb-4">Dễ Sử Dụng</h3>
            <ul className="text-gray-300 space-y-2">
              <li>✓ Simple interface</li>
              <li>✓ No installation</li>
              <li>✓ Quick setup</li>
              <li>✓ Browser-based</li>
            </ul>
          </div>
        </div>

        {/* User Info Card */}
        <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 backdrop-blur border border-blue-700 rounded-lg p-8 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-white mb-6">
            📋 Thông Tin Tài Khoản
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-blue-700/30">
              <span className="text-gray-300 text-lg">👤 Tên đầy đủ:</span>
              <span className="text-white font-semibold text-lg">
                {currentUser.fullName}
              </span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-blue-700/30">
              <span className="text-gray-300 text-lg">📧 Username:</span>
              <span className="text-white font-semibold text-lg">
                {currentUser.username}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300 text-lg">🕐 Đăng nhập lúc:</span>
              <span className="text-white font-semibold text-lg">
                {new Date(currentUser.loginTime).toLocaleString("vi-VN")}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-12 flex justify-center">
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg"
          >
            � Đăng Xuất
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-700 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
          <p>© 2024 Meeting App. All rights reserved.</p>
          <p className="text-sm mt-2">Nền tảng họp video trực tuyến hiện đại</p>
        </div>
      </footer>

      {/* Join Room Modal */}
      <JoinRoomModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSubmit={handleJoinRoomSubmit}
      />
    </div>
  );
}
