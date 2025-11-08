/**
 * Application constants
 */

// API Base URL
export const API_BASE_URL = "http://localhost:8081";

// API Endpoints
export const API_ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/login`,
  REGISTER: `${API_BASE_URL}/register`,
  REFRESH: `${API_BASE_URL}/refresh`,
  WEBSOCKET: `${API_BASE_URL}/websocket`,
  PEER_CREATE: `${API_BASE_URL}/api/peer/create`,
  PEER_CREATE_WITH_USERNAME: `${API_BASE_URL}/api/peer/create-with-username`,
  PEER_DELETE: (peerId: string) => `${API_BASE_URL}/api/peer/${peerId}`,
  PEER_ANSWER: (peerId: string) => `${API_BASE_URL}/api/peer/${peerId}/answer`,
  PEER_CANDIDATE: (peerId: string) =>
    `${API_BASE_URL}/api/peer/${peerId}/candidate`,
};

// WebSocket endpoints
export const WS_ENDPOINTS = {
  STOMP: `${API_BASE_URL}/websocket`,
  SFU_WEBHOOK: `${API_BASE_URL}/sfu-webhook`,
};

// LocalStorage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
  CURRENT_USER: "currentUser",
};

// Validation rules
export const VALIDATION = {
  USERNAME_MIN_LENGTH: 3,
  PASSWORD_MIN_LENGTH: 6,
};
