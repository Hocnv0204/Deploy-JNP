import { useEffect, useRef, useState } from "react";

interface VideoStreamProps {
  isVideoOn: boolean;
  isMuted: boolean;
}

export default function VideoStream({ isVideoOn, isMuted }: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startStream = async () => {
      try {
        if (isVideoOn) {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: !isMuted,
          });
          stream = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
          setError(null);
        }
      } catch (err) {
        setError(
          "Không thể truy cập camera hoặc mic. Vui lòng kiểm tra quyền truy cập."
        );
        console.error("Error accessing media:", err);
      }
    };

    startStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isVideoOn, isMuted]);

  if (error) {
    return (
      <div className="w-full h-full bg-gray-800 rounded-lg flex flex-col items-center justify-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-gray-300 text-center px-4">{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover rounded-lg bg-black"
    />
  );
}
