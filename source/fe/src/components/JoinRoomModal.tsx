import { useState } from "react";

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (roomCode: string) => void;
}

export default function JoinRoomModal({
  isOpen,
  onClose,
  onSubmit,
}: JoinRoomModalProps) {
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate room code
    if (!roomCode.trim()) {
      setError("Vui lòng nhập mã phòng họp");
      return;
    }

    if (roomCode.length < 3) {
      setError("Mã phòng phải có ít nhất 3 ký tự");
      return;
    }

    // Submit mã phòng và navigate đến room
    onSubmit(roomCode.toUpperCase());
    setRoomCode(""); // Reset input
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="border-b border-gray-700 px-6 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">
              Tham Gia Phòng Họp
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl transition-colors"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-6 py-8 space-y-4">
            {/* Info Text */}
            <p className="text-gray-300 text-sm">
              Nhập mã phòng họp được cấp bởi chủ phòng để tham gia cuộc họp
            </p>

            {/* Room Code Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Mã phòng họp
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  setError("");
                }}
                placeholder="VD: ROOM123"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all uppercase"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg px-4 py-3 flex items-start gap-2">
                <span className="text-red-400 text-xl mt-0.5">⚠️</span>
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>✓</span>
                <span>Tham Gia</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
