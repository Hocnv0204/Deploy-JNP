interface Participant {
  id: string;
  name: string;
  isActive: boolean;
}

interface ParticipantsListProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
}

export default function ParticipantsList({
  isOpen,
  onClose,
  participants,
}: ParticipantsListProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />

      {/* Participants Panel */}
      <div className="fixed top-0 right-0 h-full w-80 bg-gray-800 shadow-2xl flex flex-col z-40 max-sm:w-full">
        {/* Header */}
        <div className="border-b border-gray-700 p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">Người tham gia</h2>
            <p className="text-sm text-gray-400">{participants.length} người</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Participants List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {participant.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">
                      {participant.name}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {participant.isActive
                        ? "🟢 Đang hoạt động"
                        : "⚪ Không hoạt động"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
