import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchKnowledgeState,
  fetchVoicePreviewItems,
  fetchVoiceState,
  selectKnowledgeBase,
  selectVoice,
  type KnowledgeBase,
  type VoiceProfile,
} from "../../lib/ai-config-api";
import {
  getSpeechRatePreset,
  setSpeechRatePreset,
  SPEECH_RATE_PRESET_OPTIONS,
  type SpeechRatePreset,
} from "../../lib/speech-rate";
import { ApiError } from "../../lib/api-client";
import {
  enqueueLiveReplies,
  enqueueManualPlaybackItems,
  invalidateLivePlaybackAudio,
  isLivePlaybackRunning,
  resetServerTtsQueueSync,
  startLivePlayback,
  stopLivePlayback,
  syncServerTtsQueue,
} from "../../lib/live-playback-engine";
import { disconnectDouyinLive, connectDouyinLive, getDouyinIdentity, isDouyinLiveConnected } from "../../lib/douyin-live-client";
import {
  isDirectDouyinRoomInput,
  isValidDouyinRoomNo,
  needsDouyinRoomResolve,
  resolveDouyinRoom,
} from "../../lib/douyin-api";
import {
  hasDouyinSessionId,
  readSessionIdFromCookie,
  setDouyinSessionCookies,
} from "../../lib/douyin-session";
import {
  fetchLiveInteractionSettings,
  fetchLiveSession,
  insertManualPlayback,
  saveLiveInteractionSettings,
  startLiveAssistant,
  stopLiveAssistant,
  type LiveEventRecord,
  type LiveInteractionSettings,
  type LiveSessionSnapshot,
  type TtsQueueItem,
} from "../../lib/live-assistant-api";
import {
  applySentenceGapSettings,
  MAX_SENTENCE_GAP_MS,
  normalizeSentenceGapRange,
} from "../../lib/playback-gap";
import { playVoicePreviewItems, stopVoicePreviewPlayback } from "../../lib/voice-preview-player";

function SpeechRateSelector({
  value,
  onChange,
}: {
  value: SpeechRatePreset;
  onChange: (value: SpeechRatePreset) => void;
}) {
  return (
    <div>
      <span className="mb-2 block text-sm text-white/60">语速调节</span>
      <div className="flex flex-wrap gap-2">
        {SPEECH_RATE_PRESET_OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                active
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 bg-white/[0.03] text-white/70 hover:border-accent/30 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <span className="mt-2 block text-xs text-white/35">
        默认「较慢」与当前项目一致；「正常」不减速；「较快」略快。试听与直播共用，保存在本机浏览器。
      </span>
    </div>
  );
}

function SentenceGapRangeField({
  minMs,
  maxMs,
  saving,
  onMinChange,
  onMaxChange,
  onSave,
}: {
  minMs: number;
  maxMs: number;
  saving: boolean;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <span className="block text-sm text-white/60">句间间隔</span>
      <TipsBox>1s = 1000ms。每句播完后，下一句开始前会在设定范围内随机等待（单位：毫秒），最大 3000ms。</TipsBox>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="最小间隔"
          value={minMs}
          onChange={onMinChange}
          min={0}
          max={MAX_SENTENCE_GAP_MS}
          suffix="ms"
        />
        <NumberField
          label="最大间隔"
          value={maxMs}
          onChange={onMaxChange}
          min={0}
          max={MAX_SENTENCE_GAP_MS}
          suffix="ms"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent transition hover:bg-accent/15 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存句间间隔"}
        </button>
        <span className="text-xs text-white/35">
          当前：{minMs}~{maxMs} ms，例如 {minMs}~{maxMs} 表示每句之间随机等待该范围内的毫秒数
        </span>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/60">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#0d121c] px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/60">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full rounded-xl border border-white/10 bg-[#070a10] px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
        />
        {suffix ? <span className="shrink-0 text-sm text-white/40">{suffix}</span> : null}
      </div>
      {hint ? <span className="mt-2 block text-xs text-white/35">{hint}</span> : null}
    </label>
  );
}

function TipsBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100/90">
      <span className="font-medium text-amber-200">Tips：</span>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {hint ? <div className="mt-1 text-xs text-white/40">{hint}</div> : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
      />
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d121c] px-5 py-4">
      <div className="text-xs text-white/40">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function formatQueueTime(value: number) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function eventStatusLabel(status: string) {
  if (status === "queued") return "待播报";
  if (status === "ignored") return "已忽略";
  return "已接收";
}

function QueuePanel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-white/45">{hint}</p>
      </div>
      <div className="max-h-[420px] space-y-2 overflow-y-auto">{children}</div>
    </section>
  );
}

function EventQueueList({ items }: { items: LiveEventRecord[] }) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-white/5 px-4 py-8 text-center text-sm text-white/35">暂无直播间事件</div>;
  }
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-white">{item.nickname || "未知用户"}</span>
            <span className="text-xs text-white/40">{formatQueueTime(item.createdAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{item.eventType}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">{eventStatusLabel(item.status)}</span>
            {item.method ? <span className="text-white/35">{item.method}</span> : null}
          </div>
          <div className="mt-2 text-white/75">{item.content || "—"}</div>
          {item.reason ? <div className="mt-1 text-xs text-white/35">{item.reason}</div> : null}
        </div>
      ))}
    </>
  );
}

function TtsQueueList({ items }: { items: TtsQueueItem[] }) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-white/5 px-4 py-8 text-center text-sm text-white/35">暂无待播报内容</div>;
  }
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-accent">{item.kind === "reply" ? "互动回复" : item.kind}</span>
            <span className="text-xs text-white/40">{formatQueueTime(item.createdAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/45">
            {item.eventType ? <span>来源：{item.eventType}</span> : null}
            {item.topic ? <span>主题：{item.topic}</span> : null}
            <span>状态：{item.status === "pending" ? "待合成" : item.status}</span>
          </div>
          <div className="mt-2 leading-6 text-white">{item.text}</div>
        </div>
      ))}
    </>
  );
}

type LiveLogLevel = "info" | "success" | "error";

type LiveLogEntry = {
  id: string;
  time: number;
  text: string;
  level: LiveLogLevel;
};

function ConnectionLogPanel({ logs }: { logs: LiveLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#070a10] px-4 py-3 text-xs text-white/35">
        连接日志将在点击「开始 AI 直播」后显示
      </div>
    );
  }

  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-white/5 bg-[#070a10] px-4 py-3 font-mono text-xs leading-5">
      {logs.map((log) => (
        <div
          key={log.id}
          className={
            log.level === "success"
              ? "text-emerald-300"
              : log.level === "error"
                ? "text-red-300"
                : "text-white/60"
          }
        >
          <span className="text-white/30">{formatQueueTime(log.time)}</span> {log.text}
        </div>
      ))}
    </div>
  );
}

export default function LiveAssistantPage() {
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [resolvedRoomNo, setResolvedRoomNo] = useState("");
  const [loading, setLoading] = useState(true);
  const [speechRatePreset, setSpeechRatePresetState] = useState<SpeechRatePreset>(() => getSpeechRatePreset());
  const [configPreviewPlaying, setConfigPreviewPlaying] = useState(false);
  const [configPreviewCaption, setConfigPreviewCaption] = useState("");
  const [manualInsertText, setManualInsertText] = useState("");
  const [manualInserting, setManualInserting] = useState(false);
  const [message, setMessage] = useState("");
  const [resolving, setResolving] = useState(false);
  const [interactionSettings, setInteractionSettings] = useState<LiveInteractionSettings>({
    welcomeEnabled: true,
    welcomeIntervalSeconds: 60,
    welcomeMinEnterCount: 1,
    thankLikeEnabled: true,
    thankLikeIntervalSeconds: 300,
    thankLikeThreshold: 20,
    chatReplyEnabled: true,
    chatTier1MinAudience: 50,
    chatTier1ReplyCount: 50,
    chatTier2MinAudience: 200,
    chatTier2ReplyCount: 10,
    sentenceGapMinMs: 500,
    sentenceGapMaxMs: 1000,
  });
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [savingSentenceGap, setSavingSentenceGap] = useState(false);
  const [interactionUserId, setInteractionUserId] = useState("");
  const [liveSession, setLiveSession] = useState<LiveSessionSnapshot | null>(null);
  const [startingLive, setStartingLive] = useState(false);
  const [stoppingLive, setStoppingLive] = useState(false);
  const [douyinConnected, setDouyinConnected] = useState(false);
  const [douyinSessionInput, setDouyinSessionInput] = useState(() => readSessionIdFromCookie());
  const [liveCaption, setLiveCaption] = useState("");
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);
  const pollTimerRef = useRef<number | null>(null);
  const livePanelsRef = useRef<HTMLDivElement>(null);
  const liveLogSeqRef = useRef(0);

  const appendLiveLog = useCallback((text: string, level: LiveLogLevel = "info") => {
    liveLogSeqRef.current += 1;
    setLiveLogs((current) => [
      ...current,
      {
        id: `log-${liveLogSeqRef.current}`,
        time: Date.now(),
        text,
        level,
      },
    ]);
  }, []);

  const isLive = liveSession?.status === "live";
  const showLivePanels = isLive;

  const activeVoice = useMemo(
    () => voices.find((voice) => voice.voiceId === selectedVoiceId) || voices.find((voice) => voice.isActive),
    [voices, selectedVoiceId],
  );

  const activeKnowledge = useMemo(
    () => knowledgeBases.find((base) => base.id === selectedKnowledgeId) || knowledgeBases.find((base) => base.isActive),
    [knowledgeBases, selectedKnowledgeId],
  );

  const trimmedRoomInput = roomInput.trim();
  const hasRoomInput = Boolean(trimmedRoomInput);
  const isDirectRoomInput = isDirectDouyinRoomInput(trimmedRoomInput);
  const hasResolvedRoom = Boolean(
    resolvedRoomNo && trimmedRoomInput === resolvedRoomNo && isValidDouyinRoomNo(resolvedRoomNo),
  );
  const hasReadyRoom = isDirectRoomInput || hasResolvedRoom;

  const canStartLive = Boolean(activeVoice && activeKnowledge);

  function validateLiveStartForm(): { roomNo: string } | string {
    const roomNo = roomInput.trim();
    if (!roomNo) {
      return "请先填写抖音直播间房间号";
    }
    if (isDirectDouyinRoomInput(roomNo)) {
      return { roomNo };
    }
    if (!isValidDouyinRoomNo(roomNo)) {
      return "请粘贴分享文案/短链后点击「解析」，或直接输入 6-15 位房间号";
    }
    if (!resolvedRoomNo || roomNo !== resolvedRoomNo) {
      return resolvedRoomNo
        ? "房间号已修改，请重新点击「解析」确认"
        : "请先点击「解析」确认抖音直播间房间号";
    }
    return { roomNo };
  }

  const canConfigPreview = Boolean(
    activeVoice &&
      activeKnowledge &&
      activeKnowledge.status === "ready" &&
      activeKnowledge.chunkCount > 0 &&
      !isLive &&
      !configPreviewPlaying,
  );

  function handleSpeechRateChange(preset: SpeechRatePreset) {
    setSpeechRatePresetState(preset);
    setSpeechRatePreset(preset);
    if (isLive) {
      invalidateLivePlaybackAudio();
    }
  }

  async function handleManualInsert() {
    const text = manualInsertText.trim();
    if (!text) {
      setMessage("请输入要插播的内容");
      return;
    }
    if (!isLive) {
      setMessage("请先开始 AI 直播后再插播");
      return;
    }
    if (!isLivePlaybackRunning()) {
      setMessage("口播引擎未运行，请重新开始直播");
      return;
    }

    setManualInserting(true);
    setMessage("");
    try {
      const result = await insertManualPlayback({
        text,
        knowledgeBaseId: selectedKnowledgeId || activeKnowledge?.id,
      });
      const inserted = enqueueManualPlaybackItems(result.items || []);
      if (!inserted) {
        throw new Error("插播失败，播放队列未就绪");
      }
      setManualInsertText("");
      setMessage(`已加入插播队列：共 ${result.count} 句，当前句讲完后按句播报`);
      void refreshLiveSession();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "插播失败");
    } finally {
      setManualInserting(false);
    }
  }

  async function handleConfigPreview() {
    if (!activeVoice || !activeKnowledge) {
      setMessage("请先选择声音和素材");
      return;
    }
    if (activeKnowledge.status !== "ready" || activeKnowledge.chunkCount <= 0) {
      setMessage("素材尚未就绪，请等待解析完成后再试听");
      return;
    }
    if (isLive) {
      setMessage("直播中无法试听，请先停止直播");
      return;
    }

    stopVoicePreviewPlayback();
    setConfigPreviewPlaying(true);
    setConfigPreviewCaption("");
    setMessage("正在按当前配置生成试听内容...");

    try {
      const preview = await fetchVoicePreviewItems(activeVoice.voiceId, activeKnowledge.id);
      if (!preview.items?.length) {
        throw new Error("暂无可试听的讲解内容");
      }
      setMessage(
        `正在试听「${activeVoice.voiceName || activeVoice.sampleName}」· 素材「${preview.topic || activeKnowledge.topic}」`,
      );
      await playVoicePreviewItems(activeVoice.voiceId, preview.items, {
        onLine: (text) => setConfigPreviewCaption(text),
      });
      setMessage(`试听完成：${activeVoice.voiceName || activeVoice.sampleName}`);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "试听失败，请稍后重试",
      );
    } finally {
      stopVoicePreviewPlayback();
      setConfigPreviewPlaying(false);
      setConfigPreviewCaption("");
    }
  }

  function handleStopConfigPreview() {
    stopVoicePreviewPlayback();
    setConfigPreviewPlaying(false);
    setConfigPreviewCaption("");
    setMessage("已停止试听");
  }

  async function loadPageData() {
    setLoading(true);
    setMessage("");
    try {
      const [voiceState, knowledgeState, interaction] = await Promise.all([
        fetchVoiceState(),
        fetchKnowledgeState(),
        fetchLiveInteractionSettings(),
      ]);
      setVoices(voiceState.voices || []);
      setKnowledgeBases(knowledgeState.bases || []);
      setSelectedVoiceId(voiceState.voiceId || voiceState.voices.find((item) => item.isActive)?.voiceId || "");
      setSelectedKnowledgeId(
        knowledgeState.selectedKnowledgeBaseId ||
          knowledgeState.bases.find((item) => item.isActive)?.id ||
          "",
      );
      setInteractionSettings(interaction);
      setInteractionUserId(interaction.userId || "");
      applySentenceGapSettings(interaction);
      const session = await fetchLiveSession();
      setLiveSession(session);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "直播助手数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  async function handleVoiceChange(voiceId: string) {
    setSelectedVoiceId(voiceId);
    if (!voiceId) {
      return;
    }
    try {
      const result = await selectVoice(voiceId);
      setVoices(result.voices || []);
      setSelectedVoiceId(result.voiceId);
      setMessage(`已切换音色：${result.voiceName || voiceId}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "音色切换失败");
    }
  }

  async function handleKnowledgeChange(knowledgeBaseId: string) {
    setSelectedKnowledgeId(knowledgeBaseId);
    if (!knowledgeBaseId) {
      return;
    }
    try {
      const result = await selectKnowledgeBase(knowledgeBaseId);
      setKnowledgeBases(result.bases || []);
      const active = result.bases.find((item) => item.id === knowledgeBaseId);
      setSelectedKnowledgeId(result.selectedKnowledgeBaseId || knowledgeBaseId);
      setMessage(active ? `已切换素材：${active.topic}` : "素材已切换");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "素材切换失败");
    }
  }

  async function handleResolveRoom() {
    const text = roomInput.trim();
    if (!text) {
      setMessage("请先粘贴抖音分享文案、短链或直播间链接");
      return;
    }
    if (isDirectDouyinRoomInput(text)) {
      setResolvedRoomNo(text);
      setMessage(`已识别房间号：${text}`);
      return;
    }
    setResolving(true);
    try {
      const result = await resolveDouyinRoom(text);
      if (!isValidDouyinRoomNo(result.roomNo)) {
        setResolvedRoomNo("");
        setMessage("解析结果不是有效的直播间房间号，请检查分享链接");
        return;
      }
      setResolvedRoomNo(result.roomNo);
      setRoomInput(result.roomNo);
      setMessage(`已解析房间号：${result.roomNo}`);
    } catch (error) {
      setResolvedRoomNo("");
      setMessage(error instanceof ApiError ? error.message : "房间号解析失败");
    } finally {
      setResolving(false);
    }
  }

  async function handleSaveSentenceGap() {
    const normalized = normalizeSentenceGapRange(
      interactionSettings.sentenceGapMinMs,
      interactionSettings.sentenceGapMaxMs,
    );
    setSavingSentenceGap(true);
    setMessage("");
    try {
      const saved = await saveLiveInteractionSettings({
        ...interactionSettings,
        sentenceGapMinMs: normalized.minMs,
        sentenceGapMaxMs: normalized.maxMs,
      });
      setInteractionSettings(saved);
      setInteractionUserId(saved.userId || "");
      applySentenceGapSettings(saved);
      setMessage(`句间间隔已保存：${saved.sentenceGapMinMs}~${saved.sentenceGapMaxMs} ms`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "句间间隔保存失败");
    } finally {
      setSavingSentenceGap(false);
    }
  }

  async function handleSaveInteractionSettings() {
    setSavingInteraction(true);
    setMessage("");
    try {
      const saved = await saveLiveInteractionSettings(interactionSettings);
      setInteractionSettings(saved);
      setInteractionUserId(saved.userId || "");
      applySentenceGapSettings(saved);
      setMessage("互动配置已保存");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "互动配置保存失败");
    } finally {
      setSavingInteraction(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const refreshLiveSession = useCallback(async () => {
    try {
      const session = await fetchLiveSession();
      setLiveSession(session);
      syncServerTtsQueue(session.ttsQueue || []);
      setDouyinConnected(isDouyinLiveConnected());
    } catch {
      // 轮询失败时不打断直播流程
    }
  }, []);

  const handleLiveEventResult = useCallback(
    (result: Record<string, unknown>) => {
      const session = result.session as LiveSessionSnapshot | undefined;
      if (session) {
        setLiveSession(session);
        // 后端已写入 session.ttsQueue，只同步服务端队列，避免与 replyItems 重复入队导致播两遍
        syncServerTtsQueue(session.ttsQueue || []);
        return;
      }
      void refreshLiveSession();
      enqueueLiveReplies(result);
    },
    [refreshLiveSession],
  );

  function handleSaveDouyinSession() {
    const sessionId = douyinSessionInput.trim();
    if (!sessionId) {
      setMessage("请粘贴抖音 sessionid");
      return;
    }
    setDouyinSessionCookies(sessionId);
    setMessage("抖音 sessionid 已保存到浏览器 Cookie");
  }

  useEffect(() => {
    if (!isLive) {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    pollTimerRef.current = window.setInterval(() => {
      void refreshLiveSession();
    }, 2000);
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isLive, refreshLiveSession]);

  useEffect(() => {
    return () => {
      stopLivePlayback();
      stopVoicePreviewPlayback();
    };
  }, []);

  useEffect(() => {
    if (!showLivePanels) {
      return;
    }
    livePanelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showLivePanels]);

  async function handleStartLive() {
    if (!canStartLive) {
      if (!activeVoice) {
        setMessage("请先选择当前声音");
      } else if (!activeKnowledge) {
        setMessage("请先选择当前素材");
      }
      return;
    }

    const validated = validateLiveStartForm();
    if (typeof validated === "string") {
      setMessage(validated);
      return;
    }
    const { roomNo } = validated;

    const sessionId = douyinSessionInput.trim() || readSessionIdFromCookie();
    if (getDouyinIdentity() === "anchor" && !sessionId && !hasDouyinSessionId()) {
      setMessage("主播模式需要先粘贴并保存抖音 sessionid");
      return;
    }
    if (sessionId) {
      setDouyinSessionCookies(sessionId);
    }

    setStartingLive(true);
    setMessage("");
    stopVoicePreviewPlayback();
    setConfigPreviewPlaying(false);
    setConfigPreviewCaption("");
    resetServerTtsQueueSync();
    setLiveLogs([]);
    liveLogSeqRef.current = 0;
    appendLiveLog("正在创建直播会话...");
    try {
      const session = await startLiveAssistant({
        roomNo,
        voiceId: selectedVoiceId,
        knowledgeBaseId: selectedKnowledgeId,
      });
      setLiveSession(session);
      appendLiveLog(`直播会话已创建，房间号：${roomNo}`, "success");

      await startLivePlayback({
        knowledgeBaseId: selectedKnowledgeId,
        onLog: (text, level) => appendLiveLog(text, level || "info"),
        onCaption: setLiveCaption,
      });

      appendLiveLog("浏览器 WebSocket：getLiveInfo → getSignature → 连接...", "info");
      if (sessionId) {
        appendLiveLog(`抖音 sessionid=${sessionId.slice(0, 6)}***`, "info");
      }
      await connectDouyinLive({
        roomNo,
        knowledgeBaseId: selectedKnowledgeId,
        sessionId: sessionId || undefined,
        requireSession: getDouyinIdentity() === "anchor",
        onSessionUpdate: () => {
          void refreshLiveSession();
        },
        onLog: (text, level) => appendLiveLog(text, level || "info"),
        onLiveEventResult: handleLiveEventResult,
      });
      setDouyinConnected(true);
      setMessage("AI 直播已启动，浏览器 WebSocket 已连接");

      await refreshLiveSession();
    } catch (error) {
      disconnectDouyinLive();
      stopLivePlayback();
      resetServerTtsQueueSync();
      setDouyinConnected(false);
      setLiveCaption("");
      try {
        await stopLiveAssistant();
        await refreshLiveSession();
      } catch {
        // ignore rollback failure
      }
      setMessage(error instanceof ApiError ? error.message : "启动 AI 直播失败");
    } finally {
      setStartingLive(false);
    }
  }

  async function handleStopLive() {
    setStoppingLive(true);
    try {
      disconnectDouyinLive();
      stopLivePlayback();
      resetServerTtsQueueSync();
      setDouyinConnected(false);
      setLiveCaption("");
      appendLiveLog("正在停止直播...", "info");
      const session = await stopLiveAssistant();
      setLiveSession(session);
      setMessage("AI 直播已停止");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "停止直播失败");
    } finally {
      setStoppingLive(false);
    }
  }

  const metricAudience = liveSession?.metrics.audienceCount;
  const metricLikes = liveSession?.metrics.likeCount;
  const metricSales = liveSession?.metrics.estimatedSales;

  if (loading) {
    return <div className="text-white/60">正在加载直播助手...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-white/40">智播 AI / 直播助手</div>
        <h1 className="mt-2 text-3xl font-bold">直播助手</h1>
        <p className="mt-2 text-sm text-white/50">配置当前声音与素材，登录抖音后即可开始 AI 直播。</p>
      </div>

      {message ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            message.includes("成功") || message.includes("已切换") || message.includes("已解析") || message.includes("已保存") || message.includes("已启动") || message.includes("WebSocket 连接成功")
              ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              : "border border-white/10 bg-white/[0.03] text-white/75"
          }`}
        >
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">配置区域</h2>
            <p className="mt-1 text-sm text-white/45">选择本场直播使用的 AI 声音与知识库素材</p>
          </div>

          <div className="space-y-5">
            <SelectField
              label="当前声音"
              value={selectedVoiceId}
              onChange={handleVoiceChange}
              placeholder="请选择声音"
              options={voices.map((voice) => ({
                value: voice.voiceId,
                label: voice.voiceName || voice.sampleName || voice.voiceId,
              }))}
            />
            <SelectField
              label="当前素材"
              value={selectedKnowledgeId}
              onChange={handleKnowledgeChange}
              placeholder="请选择素材"
              options={knowledgeBases.map((base) => ({
                value: base.id,
                label: base.topic,
              }))}
            />
            <SpeechRateSelector value={speechRatePreset} onChange={handleSpeechRateChange} />
            <SentenceGapRangeField
              minMs={interactionSettings.sentenceGapMinMs}
              maxMs={interactionSettings.sentenceGapMaxMs}
              saving={savingSentenceGap}
              onMinChange={(value) =>
                setInteractionSettings((current) => ({ ...current, sentenceGapMinMs: value }))
              }
              onMaxChange={(value) =>
                setInteractionSettings((current) => ({ ...current, sentenceGapMaxMs: value }))
              }
              onSave={handleSaveSentenceGap}
            />

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConfigPreview}
                  disabled={!canConfigPreview}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{configPreviewPlaying ? "播放中..." : "▶"}</span>
                  {configPreviewPlaying ? "正在播放" : "当前配置播放"}
                </button>
                {configPreviewPlaying ? (
                  <button
                    type="button"
                    onClick={handleStopConfigPreview}
                    className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70 transition hover:border-red-400/30 hover:text-red-200"
                  >
                    停止
                  </button>
                ) : null}
              </div>
              {configPreviewCaption ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm leading-6 text-white/80">
                  {configPreviewCaption}
                </div>
              ) : null}
              <p className="text-xs text-white/35">
                {isLive
                  ? "直播中无法试听，请先停止直播"
                  : !activeVoice || !activeKnowledge
                    ? "请先选择声音和素材后再试听"
                    : activeKnowledge?.status !== "ready" || (activeKnowledge?.chunkCount ?? 0) <= 0
                      ? "素材解析完成后可试听"
                      : "按当前声音、素材与语速设置生成讲解并播放"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-4 text-sm text-accent/90">
            AI 声音与素材会实时同步到直播会话。如需新增或删除，请前往 AI 配置页管理。
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">开播控制</h2>
            <p className="mt-1 text-sm text-white/45">解析直播间短链，浏览器经 dycast 建立 WebSocket 接收弹幕</p>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-white/60">抖音直播间</span>
              <div className="flex gap-2">
                <input
                  value={roomInput}
                  onChange={(event) => {
                    const next = event.target.value;
                    setRoomInput(next);
                    const trimmed = next.trim();
                    if (isDirectDouyinRoomInput(trimmed)) {
                      setResolvedRoomNo(trimmed);
                      return;
                    }
                    if (resolvedRoomNo && trimmed !== resolvedRoomNo) {
                      setResolvedRoomNo("");
                    }
                  }}
                  placeholder="直接输入房间号，或粘贴分享文案/短链"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070a10] px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
                />
                <button
                  type="button"
                  onClick={handleResolveRoom}
                  disabled={resolving || !roomInput.trim() || isDirectRoomInput}
                  className="shrink-0 rounded-xl border border-white/10 px-4 py-3 text-sm text-white/80 transition hover:border-accent/40 hover:text-white disabled:opacity-50"
                  title={isDirectRoomInput ? "已输入房间号，无需解析" : undefined}
                >
                  {resolving ? "解析中..." : "解析"}
                </button>
              </div>
              <TipsBox>
                直接输入 6-15 位房间号即可开播；分享文案或 v.douyin.com 短链需点「解析」。
                主播模式需先保存 sessionid；观众模式可在 .env.local 设置 VITE_DOUYIN_IDENTITY=audience。
              </TipsBox>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm text-white/60">抖音 sessionid</span>
                <div className="flex gap-2">
                  <input
                    value={douyinSessionInput}
                    onChange={(event) => setDouyinSessionInput(event.target.value)}
                    placeholder="从浏览器 Cookie 复制 sessionid"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070a10] px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
                  />
                  <button
                    type="button"
                    onClick={handleSaveDouyinSession}
                    className="shrink-0 rounded-xl border border-white/10 px-4 py-3 text-sm text-white/80 transition hover:border-accent/40 hover:text-white"
                  >
                    保存
                  </button>
                </div>
              </label>
              {hasReadyRoom ? (
                <p className="mt-2 text-xs text-emerald-300">
                  房间号已就绪：{isDirectRoomInput ? trimmedRoomInput : resolvedRoomNo}
                  {isDirectRoomInput ? "（直接输入）" : "（已解析）"}
                </p>
              ) : needsDouyinRoomResolve(trimmedRoomInput) ? (
                <p className="mt-2 text-xs text-amber-200">检测到短链/分享文案，请点击「解析」后再开播</p>
              ) : null}
            </label>

            <button
              type="button"
              onClick={handleStartLive}
              disabled={!canStartLive || startingLive || isLive}
              className="w-full rounded-2xl bg-accent px-5 py-4 text-base font-semibold text-[#041018] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {startingLive ? "启动中..." : isLive ? "直播中" : "开始 AI 直播"}
            </button>
            {isLive ? (
              <button
                type="button"
                onClick={handleStopLive}
                disabled={stoppingLive}
                className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
              >
                {stoppingLive ? "停止中..." : "停止直播"}
              </button>
            ) : null}

            <div>
              <div className="mb-2 text-sm text-white/60">连接日志</div>
              <ConnectionLogPanel logs={liveLogs} />
            </div>

            <p className="text-center text-xs text-white/35">
              {!activeVoice || !activeKnowledge
                ? "请先选择当前声音和素材"
                : !hasRoomInput
                  ? "请填写房间号或粘贴分享链接"
                  : !hasReadyRoom
                    ? "短链/分享文案需先点「解析」"
                    : "配置已完成，可开始 AI 直播"}
            </p>
          </div>
        </section>
      </div>

      {showLivePanels ? (
        <div ref={livePanelsRef} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">直播监控</h2>
              <p className="mt-1 text-sm text-white/45">实时查看直播间事件与待播报文案</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                douyinConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
              }`}
              title={undefined}
            >
              {douyinConnected ? "浏览器 WebSocket 已连接" : "抖音未连接"}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="累计观众" value={metricAudience != null ? String(metricAudience) : "--"} />
            <MetricCard label="互动点赞" value={metricLikes != null ? String(metricLikes) : "--"} />
            <MetricCard label="预估销量" value={metricSales != null ? String(metricSales) : "--"} />
          </div>

          <div className="rounded-2xl border border-accent/20 bg-accent/5 px-5 py-4">
            <div className="text-xs text-accent/80">当前口播</div>
            <div className="mt-2 min-h-[3rem] text-base leading-7 text-white">
              {liveCaption || "等待自动讲解..."}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <QueuePanel title="直播间事件队列" hint="展示当前直播间解析到的弹幕与互动事件">
              <EventQueueList items={liveSession?.eventQueue || []} />
            </QueuePanel>
            <QueuePanel title="TTS 预备播报" hint="展示已生成、等待语音合成与口播播放的文案队列">
              <TtsQueueList items={liveSession?.ttsQueue || []} />
            </QueuePanel>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="累计观众" value="--" />
          <MetricCard label="互动点赞" value="--" />
          <MetricCard label="预估销量" value="--" />
        </div>
      )}

      <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">手动插播</h2>
          <p className="mt-1 text-sm text-white/45">将文本立即加入即将播放队列，系统会按完整句子拆分并逐句请求 TTS</p>
        </div>

        <div className="space-y-4">
          <TipsBox>
            长文本会自动按句号、问号、叹号拆成多句（最多 30 句），每句单独合成语音，避免一次性 TTS 耗时过长。插播内容会在当前句讲完后优先播报。
          </TipsBox>
          <label className="block">
            <span className="mb-2 block text-sm text-white/60">插播内容</span>
            <textarea
              value={manualInsertText}
              onChange={(event) => setManualInsertText(event.target.value)}
              placeholder="输入要立刻口播的内容，支持多句。例如：家人们注意了，今天这款有额外优惠。想要的赶紧扣 1。"
              rows={5}
              maxLength={2000}
              disabled={!isLive || manualInserting}
              className="w-full resize-y rounded-xl border border-white/10 bg-[#070a10] px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-accent/40 disabled:opacity-50"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleManualInsert}
              disabled={!isLive || manualInserting || !manualInsertText.trim()}
              className="rounded-xl border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-medium text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {manualInserting ? "处理中..." : "立即插播"}
            </button>
            <span className="text-xs text-white/35">
              {manualInsertText.length}/2000 字
              {!isLive ? " · 开播后可使用" : ""}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">互动与弹幕配置</h2>
            <p className="mt-1 text-sm text-white/45">
              配置保存在数据库，运行时从 Redis 读取；仅对当前登录账号生效
              {interactionUserId ? `（账号 ID：${interactionUserId}）` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveInteractionSettings}
            disabled={savingInteraction}
            className="shrink-0 rounded-xl border border-accent/30 bg-accent/10 px-5 py-2.5 text-sm text-accent transition hover:bg-accent/15 disabled:opacity-50"
          >
            {savingInteraction ? "保存中..." : "保存配置"}
          </button>
        </div>

        <div className="mb-6">
          <TipsBox>
            欢迎与点赞感谢遵循同一规则：先满足触发条件，且距离上次口播已超过设定的时间间隔，才会播放一次；在同一时间间隔内最多只会播放一次。配置会持久化到数据库，不同登录账号互不影响。
          </TipsBox>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm font-medium text-white">新进欢迎</div>
            <TipsBox>
              有用户进入直播间且累计进房人数达到设定值后，若距离上次欢迎已超过「欢迎间隔」，则口播欢迎一次；间隔内再次达标也不会重复欢迎。
            </TipsBox>
            <ToggleField
              label="启用进房欢迎"
              hint="关闭后，即使有用户进入也不会播报欢迎语"
              checked={interactionSettings.welcomeEnabled}
              onChange={(checked) => setInteractionSettings((current) => ({ ...current, welcomeEnabled: checked }))}
            />
            <NumberField
              label="欢迎间隔"
              hint="两次欢迎口播之间的最短间隔，间隔内最多播放一次"
              value={interactionSettings.welcomeIntervalSeconds}
              onChange={(value) =>
                setInteractionSettings((current) => ({ ...current, welcomeIntervalSeconds: value }))
              }
              min={10}
              max={3600}
              suffix="秒"
            />
            <NumberField
              label="最少进房人数"
              hint="累计进房人数达到该值，且满足间隔条件时，才触发欢迎"
              value={interactionSettings.welcomeMinEnterCount}
              onChange={(value) =>
                setInteractionSettings((current) => ({ ...current, welcomeMinEnterCount: value }))
              }
              min={1}
              max={100}
              suffix="人"
            />
          </div>

          <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm font-medium text-white">点赞感谢</div>
            <TipsBox>
              累计点赞达到设定阈值后，若距离上次感谢已超过「感谢间隔」，则口播感谢一次；例如间隔 60 秒、阈值 20 次，则 60 秒内最多感谢一次，即使点赞超过 20 次也不会连续播报。
            </TipsBox>
            <ToggleField
              label="启用点赞感谢"
              hint="关闭后，即使点赞达标也不会播报感谢语"
              checked={interactionSettings.thankLikeEnabled}
              onChange={(checked) => setInteractionSettings((current) => ({ ...current, thankLikeEnabled: checked }))}
            />
            <NumberField
              label="感谢间隔"
              hint="两次感谢口播之间的最短间隔，间隔内最多播放一次"
              value={interactionSettings.thankLikeIntervalSeconds}
              onChange={(value) =>
                setInteractionSettings((current) => ({ ...current, thankLikeIntervalSeconds: value }))
              }
              min={10}
              max={3600}
              suffix="秒"
            />
            <NumberField
              label="点赞数阈值"
              hint="累计点赞达到该次数，且满足间隔条件时，才触发感谢"
              value={interactionSettings.thankLikeThreshold}
              onChange={(value) =>
                setInteractionSettings((current) => ({ ...current, thankLikeThreshold: value }))
              }
              min={1}
              max={10000}
              suffix="次"
            />
          </div>

          <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm font-medium text-white">弹幕回复</div>
            <TipsBox>
              按在线人数分两个梯次控制回复量：未达到第一梯次人数时不限回复；达到后每 60 秒内最多回复设定条数。人数继续升高并达到第二梯次时，切换到第二梯次的条数上限。
            </TipsBox>
            <ToggleField
              label="启用弹幕回复"
              hint="关闭后，所有弹幕都不会生成口播回复"
              checked={interactionSettings.chatReplyEnabled}
              onChange={(checked) => setInteractionSettings((current) => ({ ...current, chatReplyEnabled: checked }))}
            />

            <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-4">
              <div className="text-xs font-medium uppercase tracking-wide text-white/50">第一梯次</div>
              <NumberField
                label="达到人数"
                hint="在线人数达到该值后，启用第一梯次回复上限"
                value={interactionSettings.chatTier1MinAudience}
                onChange={(value) =>
                  setInteractionSettings((current) => ({
                    ...current,
                    chatTier1MinAudience: value,
                    chatTier2MinAudience: Math.max(value, current.chatTier2MinAudience),
                  }))
                }
                min={1}
                max={1000000}
                suffix="人"
              />
              <NumberField
                label="回复条数"
                hint="每 60 秒内最多回复的有效弹幕条数"
                value={interactionSettings.chatTier1ReplyCount}
                onChange={(value) =>
                  setInteractionSettings((current) => ({ ...current, chatTier1ReplyCount: value }))
                }
                min={1}
                max={100000}
                suffix="条/分钟"
              />
            </div>

            <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-4">
              <div className="text-xs font-medium uppercase tracking-wide text-white/50">第二梯次</div>
              <NumberField
                label="达到人数"
                hint="在线人数达到该值后，切换到第二梯次（需不小于第一梯次）"
                value={interactionSettings.chatTier2MinAudience}
                onChange={(value) =>
                  setInteractionSettings((current) => ({
                    ...current,
                    chatTier2MinAudience: Math.max(current.chatTier1MinAudience, value),
                  }))
                }
                min={1}
                max={1000000}
                suffix="人"
              />
              <NumberField
                label="回复条数"
                hint="高流量时每 60 秒内最多回复的有效弹幕条数"
                value={interactionSettings.chatTier2ReplyCount}
                onChange={(value) =>
                  setInteractionSettings((current) => ({ ...current, chatTier2ReplyCount: value }))
                }
                min={1}
                max={100000}
                suffix="条/分钟"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
