import { useState, useEffect } from "react";

interface JoinNotificationProps {
  userName: string;
  onAccept: () => void;
  onReject: () => void;
  visible: boolean;
}

export default function JoinNotification({
  userName,
  onAccept,
  onReject,
  visible,
}: JoinNotificationProps) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    setShow(visible);
  }, [visible]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-2xl p-4 animate-slide-in max-sm:bottom-4 max-sm:right-4 max-sm:left-4 max-sm:w-auto">
      <div className="flex items-center gap-4 max-sm:flex-col max-sm:gap-3">
        <div className="flex-1">
          <p className="text-white font-semibold">{userName}</p>
          <p className="text-blue-100 text-sm">muốn tham gia phòng họp</p>
        </div>
        <div className="flex gap-3 max-sm:w-full">
          <button
            onClick={() => {
              setShow(false);
              onAccept();
            }}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors max-sm:flex-1"
          >
            ✓ Đồng ý
          </button>
          <button
            onClick={() => {
              setShow(false);
              onReject();
            }}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors max-sm:flex-1"
          >
            ✕ Từ chối
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @media (max-width: 640px) {
          @keyframes slideIn {
            from {
              transform: translateY(100px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
