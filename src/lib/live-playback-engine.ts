import { getToken } from "./auth-storage";
import { resolveSentenceGapMs } from "./playback-gap";
import { getTtsApiSpeechRate, resolvePlaybackRate } from "./speech-rate";

const REFILL_LOW_WATERMARK = 4;
const INITIAL_REFILL_ROUND = 1;
const TTS_PREFETCH_AHEAD = 3;
const TTS_CONCURRENCY = 3;
const AUDIO_WAIT_TIMEOUT_MS = 15000;
const AUDIO_WAIT_STEP_MS = 120;

export type PlaybackItem = {
  id: string;
  kind?: string;
  topic?: string;
  text: string;
  pauseMs?: number;
  speechRate?: number;
  leadPauseMs?: number;
  audioUrl?: string;
  audioReady?: boolean;
  audioError?: string;
  audioCancelled?: boolean;
};

type LiveEventResult = {
  ignored?: boolean;
  replyItems?: PlaybackItem[];
  item?: PlaybackItem;
  eventType?: string;
  reason?: string;
};

type PlaybackCallbacks = {
  onLog?: (text: string, level?: "info" | "success" | "error") => void;
  onCaption?: (text: string) => void;
};

let running = false;
let speaking = false;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl = "";
let currentItem: PlaybackItem | null = null;
let playQueue: PlaybackItem[] = [];
let playedItemIds: string[] = [];
let recentTexts: string[] = [];
let round = INITIAL_REFILL_ROUND;
let refillPromise: Promise<void> | null = null;
let activeTtsCount = 0;
let ttsSession = 0;
let knowledgeBaseId = "";
let callbacks: PlaybackCallbacks = {};
const synthesizingIds = new Set<string>();

function log(text: string, level: "info" | "success" | "error" = "info") {
  callbacks.onLog?.(text, level);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getApiBase() {
  return import.meta.env.VITE_API_BASE_URL || "";
}

function getTtsWebSocketUrl() {
  const base = getApiBase();
  if (base) {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/tts";
    url.search = "";
    return url.toString();
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/tts`;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function concatArrayBuffers(chunks: ArrayBuffer[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

function wavBlobFromPcmChunks(chunks: ArrayBuffer[], sampleRate: number) {
  const pcm = new Uint8Array(concatArrayBuffers(chunks));
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

function synthesizeAudioOverWebSocket(text: string) {
  return new Promise<string>((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let contentType = "audio/wav";
    let sampleRate = 24000;
    let settled = false;
    const speechRate = getTtsApiSpeechRate();
    const socket = new WebSocket(getTtsWebSocketUrl());
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error("TTS WebSocket 超时"));
    }, 60000);

    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      const token = getToken();
      socket.send(JSON.stringify({ text, speechRate, ...(token ? { token } : {}) }));
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        chunks.push(event.data as ArrayBuffer);
        return;
      }
      const message = JSON.parse(event.data as string) as {
        type?: string;
        contentType?: string;
        sampleRate?: number;
        detail?: string;
      };
      if (message.type === "start") {
        contentType = message.contentType || contentType;
        sampleRate = message.sampleRate || sampleRate;
        return;
      }
      if (message.type === "error") {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        socket.close();
        reject(new Error(message.detail || "TTS WebSocket 失败"));
        return;
      }
      if (message.type === "done") {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        socket.close();
        const blob =
          contentType === "audio/pcm"
            ? wavBlobFromPcmChunks(chunks, sampleRate)
            : new Blob(chunks, { type: contentType });
        resolve(URL.createObjectURL(blob));
      }
    };
    socket.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error("TTS WebSocket 连接失败"));
    };
    socket.onclose = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error("TTS WebSocket 提前关闭"));
    };
  });
}

async function synthesizeAudioHttp(text: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${getApiBase()}/api/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, speechRate: getTtsApiSpeechRate() }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : payload?.reason || payload?.error || "后端 TTS 不可用";
    throw new Error(detail);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

async function synthesizeAudio(text: string) {
  try {
    return await synthesizeAudioOverWebSocket(text);
  } catch (error) {
    log(`TTS WebSocket 失败，改用 HTTP 接口：${error instanceof Error ? error.message : "未知错误"}`);
  }
  return synthesizeAudioHttp(text);
}

async function apiJson<T>(path: string, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "请求失败");
  }
  return (await response.json()) as T;
}

function normalizeQueueItems(items: PlaybackItem[]) {
  return (items || [])
    .filter(Boolean)
    .map((item) => ({
      ...item,
      id: item.id || crypto.randomUUID(),
      audioUrl: item.audioUrl || "",
      audioReady: Boolean(item.audioReady && item.audioUrl),
      audioError: "",
      audioCancelled: false,
    }));
}

function appendQueueItems(items: PlaybackItem[]) {
  playQueue.push(...normalizeQueueItems(items));
  scheduleTtsPrefetch();
}

function getPrefetchTargets() {
  const ordered: PlaybackItem[] = [];
  const seen = new Set<string>();

  for (const item of playQueue) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    ordered.push(item);
  }

  return ordered
    .filter((item) => !item.audioReady && !item.audioError && !synthesizingIds.has(item.id))
    .slice(0, TTS_PREFETCH_AHEAD);
}

function scheduleTtsPrefetch() {
  if (!running) return;
  for (const item of getPrefetchTargets()) {
    if (activeTtsCount >= TTS_CONCURRENCY) return;
    void synthesizeQueueItem(item);
  }
}

async function synthesizeQueueItem(item: PlaybackItem) {
  const session = ttsSession;
  activeTtsCount += 1;
  synthesizingIds.add(item.id);
  try {
    const audioUrl = await synthesizeAudio(item.text);
    if (session !== ttsSession || item.audioCancelled || (!playQueue.includes(item) && currentItem !== item)) {
      URL.revokeObjectURL(audioUrl);
      return;
    }
    item.audioUrl = audioUrl;
    item.audioReady = true;
    item.audioError = "";
  } catch (error) {
    item.audioUrl = "";
    item.audioReady = false;
    item.audioError = error instanceof Error ? error.message : "TTS 合成失败";
  } finally {
    activeTtsCount -= 1;
    synthesizingIds.delete(item.id);
    scheduleTtsPrefetch();
  }
}

async function waitForAudio(item: PlaybackItem) {
  if (!item.audioReady && !item.audioError && !synthesizingIds.has(item.id)) {
    void synthesizeQueueItem(item);
  }
  scheduleTtsPrefetch();
  const deadline = Date.now() + AUDIO_WAIT_TIMEOUT_MS;
  while (running && Date.now() < deadline) {
    if (item.audioReady && item.audioUrl) return true;
    if (item.audioError) return false;
    await delay(AUDIO_WAIT_STEP_MS);
  }
  return Boolean(item.audioReady && item.audioUrl);
}

function resolveSpeechRate(item: PlaybackItem) {
  return resolvePlaybackRate(item);
}

function playAudioUrl(url: string, speechRate = 1) {
  scheduleTtsPrefetch();
  return new Promise<void>((resolve) => {
    if (currentAudio) {
      currentAudio.pause();
    }
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
    }
    currentAudioUrl = url;
    currentAudio = new Audio(url);
    currentAudio.playbackRate = speechRate;
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      currentAudioUrl = "";
      resolve();
    };
    currentAudio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      currentAudioUrl = "";
      resolve();
    };
    currentAudio.play().catch(() => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      currentAudioUrl = "";
      resolve();
    });
  });
}

async function speakPreparedItem(item: PlaybackItem) {
  if (!running) return;
  try {
    const ready = await waitForAudio(item);
    if (!running) return;
    if (ready && item.audioUrl) {
      const audioUrl = item.audioUrl;
      item.audioUrl = "";
      item.audioReady = false;
      await playAudioUrl(audioUrl, resolveSpeechRate(item));
      return;
    }
    item.audioCancelled = true;
    throw new Error(item.audioError || "预合成音频未就绪");
  } catch (error) {
    if (!running) return;
    log(`TTS 失败，已跳过当前句：${error instanceof Error ? error.message : "未知错误"}`, "error");
  }
}

function cleanupQueuedAudio() {
  for (const item of [...playQueue, currentItem].filter(Boolean) as PlaybackItem[]) {
    if (item.audioUrl) {
      URL.revokeObjectURL(item.audioUrl);
      item.audioUrl = "";
      item.audioReady = false;
    }
  }
}

async function doRefillQueue() {
  if (!knowledgeBaseId) return;
  try {
    const result = await apiJson<{ items: PlaybackItem[] }>("/api/live/refill", {
      knowledgeBaseId,
      round,
      playedItemIds: playedItemIds.slice(-30),
      pendingItems: playQueue.slice(0, 12).map((item) => ({
        id: item.id,
        topic: item.topic,
        text: item.text,
      })),
      recentTexts: recentTexts.slice(-10),
    });
    appendQueueItems(result.items || []);
  } catch (error) {
    log(`讲解补货失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
  }
}

async function refillQueue() {
  if (refillPromise) return refillPromise;
  refillPromise = doRefillQueue();
  try {
    await refillPromise;
  } finally {
    refillPromise = null;
  }
}

async function playNext() {
  if (!running || speaking) return;
  if (playQueue.length < REFILL_LOW_WATERMARK) {
    void refillQueue();
  }
  if (!playQueue.length) {
    await refillQueue();
  }

  const item = playQueue.shift();
  if (!item) {
    return;
  }

  await speakQueueItem(item);
}

async function speakQueueItem(item: PlaybackItem) {
  currentItem = item;
  speaking = true;
  callbacks.onCaption?.(item.text);
  log(`${item.kind === "reply" ? "回复" : item.kind === "manual" ? "插播" : item.kind === "chime" ? "整点报时" : "讲解"}：${item.text}`);
  scheduleTtsPrefetch();
  if (item.leadPauseMs) {
    await delay(item.leadPauseMs);
  }
  await speakPreparedItem(item);
  const hasNext = playQueue.length > 0;
  if (hasNext) {
    const gapMs = resolveSentenceGapMs(item.pauseMs);
    if (gapMs) {
      await delay(gapMs);
    }
  }
  playedItemIds.push(item.id);
  recentTexts.push(item.text);
  playedItemIds = playedItemIds.slice(-80);
  recentTexts = recentTexts.slice(-20);
  if (item.pauseMs) round += 1;
  currentItem = null;
  speaking = false;
  void playNext();
}

export function getPlaybackContext() {
  return {
    currentItem: currentItem
      ? { id: currentItem.id, topic: currentItem.topic, text: currentItem.text }
      : null,
    playedItemIds: playedItemIds.slice(-30),
    pendingItemIds: playQueue.map((item) => item.id).slice(0, 30),
    recentTexts: recentTexts.slice(-10),
  };
}

function prepareAndEnqueueReplies(items: PlaybackItem[]) {
  const normalized = normalizeQueueItems(items);
  if (!normalized.length) return;
  const label = normalized.every((item) => item.kind === "chime")
    ? "整点报时"
    : normalized.every((item) => item.kind === "manual")
      ? "手动插播"
      : "弹幕回复";
  log(`收到${label}，后台合成中：共 ${normalized.length} 句`);
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    playQueue.unshift(normalized[index]);
  }
  log(`已插入回复（当前句讲完后播报）：${normalized.map((item) => item.text).join(" / ")}`, "success");
  scheduleTtsPrefetch();
  if (!speaking) void playNext();
}

function prepareAndEnqueueReply(item: PlaybackItem) {
  prepareAndEnqueueReplies([item]);
}

export function enqueueLiveReplies(result: LiveEventResult | null | undefined) {
  if (!result || result.ignored) {
    if (result?.ignored) {
      log(`弹幕未生成回复｜${result.eventType || "event"}｜${result.reason || "已忽略"}`);
    }
    return false;
  }
  if (result.replyItems?.length) {
    prepareAndEnqueueReplies(result.replyItems);
    return true;
  }
  if (result.item) {
    void prepareAndEnqueueReply(result.item);
    return true;
  }
  return false;
}

const syncedServerTtsIds = new Set<string>();

export function resetServerTtsQueueSync() {
  syncedServerTtsIds.clear();
}

export function syncServerTtsQueue(items: Array<{ id: string; kind?: string; topic?: string; text: string }>) {
  const fresh = items.filter((item) => item.text && !syncedServerTtsIds.has(item.id));
  if (!fresh.length) {
    return false;
  }
  for (const item of fresh) {
    syncedServerTtsIds.add(item.id);
  }
  prepareAndEnqueueReplies(
    fresh.map((item) => ({
      id: item.id,
      kind: item.kind || "reply",
      topic: item.topic || (item.kind === "chime" ? "整点报时" : "直播互动"),
      text: item.text,
    })),
  );
  return true;
}

export function enqueueManualPlaybackItems(items: PlaybackItem[]) {
  if (!running) {
    return false;
  }
  const normalized = normalizeQueueItems(items);
  if (!normalized.length) {
    return false;
  }
  log(`收到手动插播，后台合成中：共 ${normalized.length} 句`);
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    playQueue.unshift(normalized[index]);
  }
  log(`已插入插播队列（当前句讲完后播报）：${normalized.map((item) => item.text).join(" / ")}`, "success");
  scheduleTtsPrefetch();
  if (!speaking) {
    void playNext();
  }
  return true;
}

export async function startLivePlayback(options: {
  knowledgeBaseId: string;
  onLog?: PlaybackCallbacks["onLog"];
  onCaption?: PlaybackCallbacks["onCaption"];
}) {
  if (running) return;
  knowledgeBaseId = options.knowledgeBaseId;
  callbacks = { onLog: options.onLog, onCaption: options.onCaption };
  running = true;
  ttsSession += 1;
  cleanupQueuedAudio();
  playQueue = [];
  playedItemIds = [];
  recentTexts = [];
  currentItem = null;
  round = INITIAL_REFILL_ROUND;
  log("自动讲解已启动，正在生成首批口播内容...", "success");
  await refillQueue();
  void playNext();
}

export function invalidateLivePlaybackAudio() {
  if (!running) return;
  ttsSession += 1;
  synthesizingIds.clear();
  for (const item of playQueue) {
    if (item.audioUrl) {
      URL.revokeObjectURL(item.audioUrl);
    }
    item.audioUrl = "";
    item.audioReady = false;
    item.audioError = "";
    item.audioCancelled = false;
  }
  scheduleTtsPrefetch();
}

export function stopLivePlayback() {
  if (!running && !speaking && !playQueue.length && !currentAudio) {
    callbacks = {};
    return;
  }
  running = false;
  ttsSession += 1;
  cleanupQueuedAudio();
  playQueue = [];
  currentItem = null;
  if (currentAudio) {
    currentAudio.pause();
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = "";
    }
    currentAudio = null;
  }
  speaking = false;
  callbacks.onCaption?.("");
  log("自动讲解已停止");
  callbacks = {};
}

export function isLivePlaybackRunning() {
  return running;
}
