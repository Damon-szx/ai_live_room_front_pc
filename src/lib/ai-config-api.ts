import { apiRequest, ApiError } from "./api-client";
import { getToken } from "./auth-storage";
import { getTtsApiSpeechRate } from "./speech-rate";
import { apiUploadForm } from "./api-form-client";

export type VoiceProfile = {
  id: number;
  voiceId: string;
  voiceName: string;
  voiceDescription: string;
  sampleName: string;
  voiceTransport: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VoiceState = {
  voiceId: string;
  voiceName: string;
  voices: VoiceProfile[];
  ready: boolean;
  apiKeyConfigured: boolean;
};

export type KnowledgeBase = {
  id: string;
  topic: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  chunkCount: number;
};

export type KnowledgeState = {
  selectedKnowledgeBaseId: string;
  bases: KnowledgeBase[];
};

export function fetchVoiceState() {
  return apiRequest<VoiceState>("/api/voice");
}

export function fetchKnowledgeState() {
  return apiRequest<KnowledgeState>("/api/knowledge-bases");
}

export function uploadVoiceSample(file: File, name: string, description: string) {
  const body = new FormData();
  body.append("voice", file);
  body.append("name", name);
  body.append("description", description);
  return apiUploadForm<{ ready: boolean; voiceName: string; voiceId: string; voices: VoiceProfile[] }>(
    "/api/voice-sample",
    body,
  );
}

export function uploadKnowledgeBase(topic: string, file: File) {
  const body = new FormData();
  body.append("topic", topic);
  body.append("file", file);
  return apiUploadForm<{ base: KnowledgeBase; knowledge: KnowledgeState }>("/api/knowledge-bases", body);
}

export function selectVoice(voiceId: string) {
  return apiRequest<VoiceState>("/api/voice/select", {
    method: "POST",
    body: { voiceId },
  });
}

export function selectKnowledgeBase(knowledgeBaseId: string) {
  return apiRequest<KnowledgeState>("/api/knowledge-bases/select", {
    method: "POST",
    body: { knowledgeBaseId },
  });
}

export function deleteVoice(voiceId: string) {
  return apiRequest<VoiceState>(`/api/voice/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
  });
}

export function deleteKnowledgeBase(knowledgeBaseId: string) {
  return apiRequest<KnowledgeState>(`/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`, {
    method: "DELETE",
  });
}

function resolveApiBase() {
  return import.meta.env.VITE_API_BASE_URL || "";
}

async function parsePreviewError(response: Response) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
  } catch {
    // ignore
  }
  return "试听失败，请稍后重试";
}

export type VoicePreviewItem = {
  id: string;
  kind?: string;
  topic?: string;
  text: string;
  pauseMs?: number;
  speechRate?: number;
  leadPauseMs?: number;
};

export type VoicePreviewResponse = {
  items: VoicePreviewItem[];
  voiceId: string;
  knowledgeBaseId: string;
  topic: string;
};

export function fetchVoicePreviewItems(voiceId: string, knowledgeBaseId?: string) {
  return apiRequest<VoicePreviewResponse>("/api/voice/preview", {
    method: "POST",
    body: {
      voiceId,
      ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
    },
  });
}

export async function synthesizeVoicePreviewLine(voiceId: string, text: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${resolveApiBase()}/api/voice/speak`, {
    method: "POST",
    headers,
    body: JSON.stringify({ voiceId, text, speechRate: getTtsApiSpeechRate() }),
  });
  if (!response.ok) {
    throw new ApiError(await parsePreviewError(response), response.status);
  }
  return response.blob();
}
