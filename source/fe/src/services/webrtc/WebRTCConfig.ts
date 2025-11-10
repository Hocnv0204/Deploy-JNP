export interface WebRTCConfig {
    iceServers?: RTCIceServer[];
    signalingUrl: string;
    roomId: string;
    userId: string;
    apiBaseUrl?: string;
    onRemoteStreamAdded?: (stream: MediaStream, peerId: string) => void;
    onRemoteStreamRemoved?: (peerId: string) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
    onConnectionReady?: () => void;
    iceCandidatePoolSize?: number;
  }
