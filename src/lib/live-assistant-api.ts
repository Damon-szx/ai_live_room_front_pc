import { apiRequest } from "./api-client";

export type LiveInteractionSettings = {
  userId?: string;
  welcomeEnabled: boolean;
  welcomeIntervalSeconds: number;
  welcomeMinEnterCount: number;
  thankLikeEnabled: boolean;
  thankLikeIntervalSeconds: number;
  thankLikeThreshold: number;
  chatReplyEnabled: boolean;
  chatTier1MinAudience: number;
  chatTier1ReplyCount: number;
  chatTier2MinAudience: number;
  chatTier2ReplyCount: number;
  sentenceGapMinMs: number;
  sentenceGapMaxMs: number;
};

function toPayload(settings: LiveInteractionSettings): Omit<LiveInteractionSettings, "userId"> {
  return {
    welcomeEnabled: settings.welcomeEnabled,
    welcomeIntervalSeconds: settings.welcomeIntervalSeconds,
    welcomeMinEnterCount: settings.welcomeMinEnterCount,
    thankLikeEnabled: settings.thankLikeEnabled,
    thankLikeIntervalSeconds: settings.thankLikeIntervalSeconds,
    thankLikeThreshold: settings.thankLikeThreshold,
    chatReplyEnabled: settings.chatReplyEnabled,
    chatTier1MinAudience: settings.chatTier1MinAudience,
    chatTier1ReplyCount: settings.chatTier1ReplyCount,
    chatTier2MinAudience: settings.chatTier2MinAudience,
    chatTier2ReplyCount: settings.chatTier2ReplyCount,
    sentenceGapMinMs: settings.sentenceGapMinMs,
    sentenceGapMaxMs: settings.sentenceGapMaxMs,
  };
}

export function fetchLiveInteractionSettings() {
  return apiRequest<LiveInteractionSettings>("/api/live-assistant/interaction-settings");
}

export function saveLiveInteractionSettings(settings: LiveInteractionSettings) {
  return apiRequest<LiveInteractionSettings>("/api/live-assistant/interaction-settings", {
    method: "PUT",
    body: toPayload(settings),
  });
}

export type LiveSessionMetrics = {
  audienceCount: number | string | null;
  likeCount: number | string | null;
  estimatedSales: number | string | null;
};

export type LiveEventRecord = {
  id: string;
  eventType: string;
  method: string;
  nickname: string;
  content: string;
  status: string;
  reason?: string;
  createdAt: number;
};

export type TtsQueueItem = {
  id: string;
  kind: string;
  text: string;
  topic: string;
  status: string;
  eventType: string;
  createdAt: number;
};

export type LiveSessionSnapshot = {
  userId: string;
  status: "idle" | "live";
  roomNo: string;
  voiceId: string;
  knowledgeBaseId: string;
  startedAt: number | null;
  metrics: LiveSessionMetrics;
  eventQueue: LiveEventRecord[];
  ttsQueue: TtsQueueItem[];
};

export function fetchLiveSession() {
  return apiRequest<LiveSessionSnapshot>("/api/live-assistant/session");
}

export function startLiveAssistant(payload: {
  roomNo: string;
  voiceId: string;
  knowledgeBaseId: string;
}) {
  return apiRequest<LiveSessionSnapshot>("/api/live-assistant/start", {
    method: "POST",
    body: payload,
  });
}

export function stopLiveAssistant() {
  return apiRequest<LiveSessionSnapshot>("/api/live-assistant/stop", {
    method: "POST",
  });
}

export function postLiveEvent(body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/api/live-event", {
    method: "POST",
    body,
  });
}

export type ManualInsertResponse = {
  items: Array<{
    id: string;
    kind?: string;
    topic?: string;
    text: string;
    pauseMs?: number;
    speechRate?: number;
    leadPauseMs?: number;
  }>;
  count: number;
};

export function insertManualPlayback(payload: { text: string; knowledgeBaseId?: string }) {
  return apiRequest<ManualInsertResponse>("/api/live-assistant/manual-insert", {
    method: "POST",
    body: payload,
  });
}
