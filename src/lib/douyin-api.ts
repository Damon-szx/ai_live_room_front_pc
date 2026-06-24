import { apiRequest } from "./api-client";

const CLIENT_ID_KEY = "ai-live-client-id";

export type DouyinSessionStatus = {
  loggedIn: boolean;
  clientId?: string;
  nickname?: string;
  updatedAt?: string;
};

export type DouyinResolveResult = {
  roomNo: string;
  sourceUrl?: string;
  resolvedUrl?: string;
};

/** live.douyin.com/{web_rid} 常见为 6-15 位数字 */
export function isValidDouyinRoomNo(roomNo: string) {
  return /^\d{6,15}$/.test(String(roomNo || "").trim());
}

/** 输入是否已是可直接使用的房间号（纯数字 web_rid） */
export function isDirectDouyinRoomInput(text: string) {
  return isValidDouyinRoomNo(text);
}

/** 短链、分享文案、完整链接等，需要走解析接口 */
export function needsDouyinRoomResolve(text: string) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  return !isDirectDouyinRoomInput(trimmed);
}

export function getClientId() {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = `web-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function fetchDouyinSessionStatus(clientId = getClientId()) {
  return apiRequest<DouyinSessionStatus>(`/api/douyin/session/status?clientId=${encodeURIComponent(clientId)}`, {
    auth: false,
  });
}

export function bindDouyinSession(sessionId: string, nickname = "", clientId = getClientId()) {
  return apiRequest<{ ok: boolean; nickname?: string; loggedIn: boolean }>("/api/douyin/session/bind", {
    method: "POST",
    auth: false,
    body: {
      clientId,
      sessionId,
      nickname,
    },
  });
}

export function logoutDouyinSession(clientId = getClientId()) {
  return apiRequest<{ ok: boolean }>(`/api/douyin/session?clientId=${encodeURIComponent(clientId)}`, {
    method: "DELETE",
    auth: false,
  });
}

export function resolveDouyinRoom(text: string, sessionId = "") {
  return apiRequest<DouyinResolveResult>("/api/douyin/resolve-room", {
    method: "POST",
    auth: false,
    body: {
      text,
      sessionId: sessionId || undefined,
    },
  });
}
