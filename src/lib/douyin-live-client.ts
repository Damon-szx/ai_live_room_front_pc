import { createDouyinCast } from "./douyin-live-bridge";
import {
  ensureDouyinSessionCookie,
  hasDouyinSessionId,
  readSessionIdFromCookie,
  verifyDouyinProxyAvailable,
} from "./douyin-session";
import { postLiveEvent } from "./live-assistant-api";
import { getPlaybackContext } from "./live-playback-engine";

type DouyinUser = {
  id?: string | number;
  name?: string;
  avatar?: string;
};

type DouyinGift = {
  name?: string;
  count?: number | string;
};

export type DouyinLiveMessage = {
  id?: string | number;
  method?: string;
  user?: DouyinUser;
  content?: string;
  rtfContent?: Array<{ text?: string }>;
  gift?: DouyinGift;
  rank?: Array<{ rank?: number; nickname?: string }>;
  room?: {
    audienceCount?: number | string;
    totalUserCount?: number | string;
    likeCount?: number | string;
  };
};

type LiveEventBuffer = {
  count: number;
  users: Map<string, { id: string; nickname: string; avatar: string }>;
  timer: number;
};

type ConnectOptions = {
  roomNo: string;
  knowledgeBaseId: string;
  sessionId?: string;
  requireSession?: boolean;
  onStatus?: (text: string) => void;
  onLog?: (text: string, level?: DouyinLogLevel) => void;
  onSessionUpdate?: () => void;
  onLiveEventResult?: (result: Record<string, unknown>) => void;
};

export type DouyinLogLevel = "info" | "success" | "error";

type DyLiveInfo = {
  nickname?: string;
  title?: string;
};

export function getDouyinIdentity(): "audience" | "anchor" {
  return typeof __DOUYIN_IDENTITY__ !== "undefined" && __DOUYIN_IDENTITY__ === "audience" ? "audience" : "anchor";
}

function resolveDouyinSessionId(options: ConnectOptions) {
  const manual = options.sessionId?.trim() || "";
  if (manual) {
    return ensureDouyinSessionCookie(manual);
  }
  const fromCookie = readSessionIdFromCookie();
  if (fromCookie) {
    return fromCookie;
  }
  if (getDouyinIdentity() === "audience" && !options.requireSession) {
    return "";
  }
  if (hasDouyinSessionId()) {
    return readSessionIdFromCookie() || "ready";
  }
  throw new Error("请先粘贴抖音 sessionid 并保存，或在浏览器登录抖音后再开播。");
}

function assertDouyinMssdkLoaded() {
  const acrawler = (window as Window & { byted_acrawler?: { frontierSign?: unknown } }).byted_acrawler;
  if (!acrawler?.frontierSign) {
    throw new Error(
      "抖音签名 SDK 未加载（mssdk.js）。请硬刷新页面后重试，并确认 /dycast-mssdk.js 可正常访问。",
    );
  }
}

function emitDouyinLog(options: ConnectOptions, text: string, level: DouyinLogLevel = "info") {
  options.onLog?.(text, level);
  options.onStatus?.(text);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DyCastInstance = any;

let douyinCast: DyCastInstance | null = null;
let douyinRoomNo = "";
let boundKnowledgeBaseId = "";
const processedLiveEventIds = new Set<string>();
let douyinMessageSeq = 0;

const liveEventBuffer: Record<"like" | "member", LiveEventBuffer> = {
  like: { count: 0, users: new Map(), timer: 0 },
  member: { count: 0, users: new Map(), timer: 0 },
};

function normalizeDouyinEventType(method: string) {
  const eventTypes: Record<string, string> = {
    WebcastChatMessage: "chat",
    WebcastGiftMessage: "gift",
    WebcastLikeMessage: "like",
    WebcastMemberMessage: "member",
    WebcastSocialMessage: "follow",
    WebcastEmojiChatMessage: "chat",
    WebcastRoomUserSeqMessage: "room_stats",
  };
  return eventTypes[method] || "";
}

function normalizeDouyinUser(user?: DouyinUser) {
  return {
    id: String(user?.id || ""),
    nickname: user?.name || "观众",
    avatar: user?.avatar || "",
  };
}

function formatDouyinUserLabel(user?: DouyinUser) {
  const normalized = normalizeDouyinUser(user);
  return `userId=${normalized.id || "未知"}｜昵称=${normalized.nickname}`;
}

function logDouyinChatDetail(
  message: DouyinLiveMessage,
  onLog?: ConnectOptions["onLog"],
) {
  const content = extractDouyinMessageContent(message);
  const preview = content || "(空)";
  onLog?.(
    `抖音用户发言｜${message.method || "WebcastChatMessage"}｜${formatDouyinUserLabel(message.user)}｜发言=${preview}`,
    content ? "success" : "error",
  );
}

function extractDouyinMessageContent(message: DouyinLiveMessage) {
  const rtfText = (message.rtfContent || [])
    .map((item) => String(item?.text || "").trim())
    .filter(Boolean)
    .join("");
  const direct = String(message.content || "").trim();
  if (rtfText) return rtfText;
  if (direct && !direct.startsWith("http")) return direct;
  if (direct.startsWith("http")) return "[表情]";
  return direct;
}

function buildDouyinDedupeKey(message: DouyinLiveMessage) {
  const method = message.method || "unknown";
  if (message.id !== undefined && message.id !== null && String(message.id) !== "") {
    return `${method}-${message.id}`;
  }
  const content = extractDouyinMessageContent(message);
  const userId = message.user?.id || message.user?.name || "unknown";
  douyinMessageSeq += 1;
  return `${method}-local-${userId}-${content}-${douyinMessageSeq}`;
}

function isEventForActiveRoom(roomNo?: string) {
  const incoming = String(roomNo || douyinRoomNo || "").trim();
  const active = String(douyinRoomNo || "").trim();
  return Boolean(incoming && active && incoming === active);
}

function rejectStaleRoomEvent(
  roomNo: string | undefined,
  onLog?: ConnectOptions["onLog"],
) {
  onLog?.(
    `忽略非当前直播间事件｜eventRoom=${roomNo || "unknown"}｜activeRoom=${douyinRoomNo || "unknown"}`,
    "info",
  );
}

async function forwardDouyinMessage(
  message: DouyinLiveMessage,
  knowledgeBaseId: string,
  options?: Pick<ConnectOptions, "onLog" | "onSessionUpdate" | "onLiveEventResult">,
) {
  const { onLog, onSessionUpdate, onLiveEventResult } = options || {};
  if (!isEventForActiveRoom(douyinRoomNo)) {
    rejectStaleRoomEvent(douyinRoomNo, onLog);
    return;
  }
  const eventType = normalizeDouyinEventType(message.method || "");
  if (!eventType) {
    onLog?.(`未识别抖音消息类型：${message.method || "unknown"}`, "info");
    return;
  }

  const playbackContext = getPlaybackContext();

  if (eventType === "room_stats") {
    const result = await postLiveEvent({
      platform: "douyin",
      roomNo: douyinRoomNo,
      eventId: buildDouyinDedupeKey(message),
      type: "room_stats",
      user: { nickname: "系统", id: "room-stats" },
      content: "",
      raw: message,
      knowledgeBaseId: boundKnowledgeBaseId || knowledgeBaseId,
      ...playbackContext,
    });
    onLiveEventResult?.(result);
    onSessionUpdate?.();
    return;
  }

  const dedupeKey = buildDouyinDedupeKey(message);
  if (processedLiveEventIds.has(dedupeKey)) return;
  processedLiveEventIds.add(dedupeKey);
  if (processedLiveEventIds.size > 500) {
    const oldestId = processedLiveEventIds.values().next().value;
    if (oldestId) processedLiveEventIds.delete(oldestId);
  }

  const eventPayload = {
    platform: "douyin",
    roomNo: douyinRoomNo,
    eventId: dedupeKey,
    type: eventType,
    user: normalizeDouyinUser(message.user),
    content: extractDouyinMessageContent(message),
    gift: message.gift || null,
    raw: message,
    knowledgeBaseId: boundKnowledgeBaseId || knowledgeBaseId,
    ...getPlaybackContext(),
  };

  // 弹幕/互动事件异步上报，不阻塞后续消息接收；讲解队列继续播放。
  if (eventType === "chat") {
    logDouyinChatDetail(message, onLog);
    void postLiveEvent(eventPayload)
      .then((result) => {
        if (result.ignored) {
          const reason = String(result.reason || "unknown");
          const parseMeta = result.parseMeta as Record<string, unknown> | undefined;
          const source = parseMeta?.contentSource ? `｜source=${parseMeta.contentSource}` : "";
          onLog?.(`弹幕未进入回复队列｜${reason}${source}`, "info");
        }
        onLiveEventResult?.(result);
        onSessionUpdate?.();
      })
      .catch((error: Error) => {
        onLog?.(`弹幕上报失败：${error.message}`, "error");
      });
    return;
  }

  const result = await postLiveEvent(eventPayload);
  onLiveEventResult?.(result);
  onSessionUpdate?.();
}

function flushBufferedLiveEvent(
  eventType: "like" | "member",
  knowledgeBaseId: string,
  onSessionUpdate?: () => void,
  onLiveEventResult?: (result: Record<string, unknown>) => void,
  onLog?: ConnectOptions["onLog"],
) {
  const buffer = liveEventBuffer[eventType];
  if (!buffer.count) return;
  if (!isEventForActiveRoom(douyinRoomNo)) {
    rejectStaleRoomEvent(douyinRoomNo, onLog);
    buffer.count = 0;
    buffer.users.clear();
    if (buffer.timer) {
      window.clearTimeout(buffer.timer);
      buffer.timer = 0;
    }
    return;
  }
  const users = [...buffer.users.values()];
  const user = users[0] || { id: "", nickname: "观众", avatar: "" };
  const count = buffer.count;
  buffer.count = 0;
  buffer.users.clear();
  if (buffer.timer) {
    window.clearTimeout(buffer.timer);
    buffer.timer = 0;
  }

  void postLiveEvent({
    platform: "douyin",
    roomNo: douyinRoomNo,
    eventId: `${eventType}-${Date.now()}`,
    type: eventType,
    user,
    content: "",
    raw: { count, users: users.slice(0, 10) },
    knowledgeBaseId: boundKnowledgeBaseId || knowledgeBaseId,
    ...getPlaybackContext(),
  }).then((result) => {
    onLiveEventResult?.(result);
    onSessionUpdate?.();
  });
}

function bufferWeakLiveEvent(
  eventType: "like" | "member",
  message: DouyinLiveMessage,
  knowledgeBaseId: string,
  onSessionUpdate?: () => void,
  onLiveEventResult?: (result: Record<string, unknown>) => void,
  onLog?: ConnectOptions["onLog"],
) {
  const buffer = liveEventBuffer[eventType];
  const user = normalizeDouyinUser(message.user);
  buffer.count += 1;
  if (user.id || user.nickname) {
    buffer.users.set(user.id || user.nickname, user);
  }
  if (!buffer.timer) {
    buffer.timer = window.setTimeout(
      () =>
        flushBufferedLiveEvent(eventType, knowledgeBaseId, onSessionUpdate, onLiveEventResult, onLog),
      3000,
    );
  }
}

async function processDouyinMessages(
  messages: DouyinLiveMessage[],
  knowledgeBaseId: string,
  options?: Pick<ConnectOptions, "onLog" | "onSessionUpdate" | "onLiveEventResult">,
) {
  const { onSessionUpdate, onLiveEventResult, onLog } = options || {};
  const strongMessages: DouyinLiveMessage[] = [];
  for (const message of messages || []) {
    const eventType = normalizeDouyinEventType(message.method || "");
    if (eventType === "like" || eventType === "member") {
      bufferWeakLiveEvent(eventType, message, knowledgeBaseId, onSessionUpdate, onLiveEventResult, onLog);
    } else if (eventType) {
      strongMessages.push(message);
    }
  }
  for (const message of strongMessages) {
    await forwardDouyinMessage(message, knowledgeBaseId, options);
  }
}

export async function connectDouyinLive(options: ConnectOptions): Promise<void> {
  assertDouyinMssdkLoaded();

  const proxyOk = await verifyDouyinProxyAvailable();
  if (!proxyOk) {
    throw new Error("无法连接本地 /dylive 代理。请使用 npm run dev 启动前端，不要用静态文件直接打开。");
  }

  const sessionId = resolveDouyinSessionId(options);
  if (sessionId && sessionId !== "ready") {
    ensureDouyinSessionCookie(sessionId);
  }

  if (douyinCast) {
    douyinCast.close(1000, "重新连接");
    douyinCast = null;
  }

  douyinRoomNo = options.roomNo;
  boundKnowledgeBaseId = options.knowledgeBaseId;
  processedLiveEventIds.clear();
  douyinMessageSeq = 0;
  for (const key of ["like", "member"] as const) {
    const buffer = liveEventBuffer[key];
    if (buffer.timer) {
      window.clearTimeout(buffer.timer);
    }
    buffer.count = 0;
    buffer.users.clear();
    buffer.timer = 0;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const finishReject = (reason: unknown) => {
      if (settled) return;
      settled = true;
      reject(reason instanceof Error ? reason : new Error(String(reason || "WebSocket 连接失败")));
    };

    const cast = createDouyinCast(options.roomNo);
    douyinCast = cast;
    emitDouyinLog(
      options,
      `抖音连接：${getDouyinIdentity() === "anchor" ? "主播模式" : "观众模式"}｜roomId/uniqueId 计算 signature｜房间号=${options.roomNo}`,
    );
    emitDouyinLog(options, `正在经 Vite 反代建立 WebSocket（/socket → 抖音 push/v2）...`);

    cast.on("open", (_event: Event, info?: DyLiveInfo) => {
      const label = info?.nickname || options.roomNo;
      const title = info?.title || "抖音直播间";
      const liveInfo = (cast as { getLiveInfo?: () => { roomId?: string } }).getLiveInfo?.();
      const wsRoomId = liveInfo?.roomId || "unknown";
      emitDouyinLog(
        options,
        `已连接：${label}｜${title}｜WS room_id=${wsRoomId}（web_rid=${options.roomNo}）`,
      );
      emitDouyinLog(
        options,
        `WebSocket 连接已建立，开始接收直播间消息｜${label}｜${title}`,
        "success",
      );
      finishResolve();
    });

    cast.on("reconnect", () => {
      emitDouyinLog(options, `WebSocket 已重新连接，房间号：${options.roomNo}`, "success");
    });

    cast.on("message", (messages: DouyinLiveMessage[]) => {
      if (messages?.length) {
        const preview = messages
          .slice(0, 3)
          .map((item) => `${item.method || "unknown"}:${extractDouyinMessageContent(item) || item.user?.name || ""}`)
          .join(" | ");
        emitDouyinLog(options, `收到 ${messages.length} 条直播间消息：${preview}`, "info");
      }
      void processDouyinMessages(messages, options.knowledgeBaseId, {
        onLog: options.onLog,
        onSessionUpdate: options.onSessionUpdate,
        onLiveEventResult: options.onLiveEventResult,
      }).catch((error: Error) => {
        emitDouyinLog(options, `抖音消息处理失败：${error.message}`, "error");
      });
    });

    cast.on("close", (code: number, reason: string) => {
      douyinCast = null;
      const reasonText = String(reason || "连接关闭");
      if (code === 4001) {
        emitDouyinLog(
          options,
          `直播间状态解析为「${reasonText}」。若主播仍在播，请硬刷新页面后重试（抖音页面结构已更新，需重新加载解析逻辑）。`,
          "error",
        );
      } else if (reasonText.includes("CLOSE_NO_STATUS")) {
        emitDouyinLog(
          options,
          "抖音 WebSocket 被服务端断开（CLOSE_NO_STATUS）。常见原因：房间号错误、signature 失效，或未用 npm run dev 启动。",
          "error",
        );
      } else {
        emitDouyinLog(options, `抖音 WebSocket 关闭：code=${code} reason=${reasonText}`, code === 1000 ? "info" : "error");
      }
      if (!settled) {
        finishReject(new Error(reasonText || `WebSocket 连接关闭 (${code})`));
      }
    });

    cast.on("error", (error: Error) => {
      emitDouyinLog(options, `抖音连接错误：${error.message}`, "error");
      if (!settled) {
        finishReject(error);
      }
    });

    void cast.connect().catch((error: unknown) => {
      douyinCast = null;
      finishReject(error);
    });
  });
}

export function disconnectDouyinLive() {
  if (douyinCast) {
    douyinCast.close(1000, "用户主动断开");
    douyinCast = null;
  }
  douyinRoomNo = "";
  boundKnowledgeBaseId = "";
  for (const key of ["like", "member"] as const) {
    const buffer = liveEventBuffer[key];
    if (buffer.timer) {
      window.clearTimeout(buffer.timer);
    }
    buffer.count = 0;
    buffer.users.clear();
    buffer.timer = 0;
  }
}

export function isDouyinLiveConnected() {
  return Boolean(douyinCast);
}
