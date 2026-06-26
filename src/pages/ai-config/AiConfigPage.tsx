import {
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deleteKnowledgeBase,
  deleteVoice,
  fetchKnowledgeState,
  fetchVoicePreviewItems,
  fetchVoiceState,
  selectKnowledgeBase,
  selectVoice,
  uploadKnowledgeBase,
  uploadVoiceSample,
  type KnowledgeBase,
  type VoiceProfile,
} from "../../lib/ai-config-api";
import { fetchLiveInteractionSettings } from "../../lib/live-assistant-api";
import { applySentenceGapSettings } from "../../lib/playback-gap";
import { playVoicePreviewItems, stopVoicePreviewPlayback } from "../../lib/voice-preview-player";
import { ApiError } from "../../lib/api-client";

const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
const AUDIO_ACCEPT = [".mp3", ".wav", ".m4a"];
const KNOWLEDGE_ACCEPT = [".txt", ".pdf", ".doc", ".docx"];

function formatRelativeTime(value: string) {
  if (!value) {
    return "刚刚";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").slice(0, 16);
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} 天前`;
  }
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string) {
  if (status === "ready") {
    return "已就绪";
  }
  if (status === "processing") {
    return "处理中";
  }
  if (status === "failed") {
    return "失败";
  }
  return status;
}

function UploadDropzone({
  title,
  hint,
  acceptText,
  accept,
  uploading,
  onFile,
}: {
  title: string;
  hint: string;
  acceptText: string;
  accept: string;
  uploading: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      onFile(file);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
      }}
      className="cursor-pointer rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center transition hover:border-accent/40 hover:bg-accent/5"
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => handleFiles(event.target.files)} />
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-xl text-accent">
        ↑
      </div>
      <div className="text-base font-medium text-white">{uploading ? "上传中..." : title}</div>
      <div className="mt-2 text-sm text-white/45">{hint}</div>
      <div className="mt-4 text-xs text-white/30">{acceptText}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/60">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function matchesQuery(value: string, query: string) {
  if (!query.trim()) {
    return true;
  }
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">⌕</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

function PreviewButton({
  playing,
  disabled,
  onClick,
}: {
  playing: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || playing}
      className="rounded-lg border border-accent/30 px-3 py-1 text-xs text-accent transition hover:border-accent/60 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {playing ? "播放中..." : "播放"}
    </button>
  );
}

function DeleteButton({
  deleting,
  onClick,
}: {
  deleting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deleting}
      className="rounded-lg border border-red-500/20 px-3 py-1 text-xs text-red-300 transition hover:border-red-400/40 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {deleting ? "删除中..." : "删除"}
    </button>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-[#0d121c] px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/10 ${props.className || ""}`}
    />
  );
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full rounded-xl border border-white/10 bg-[#0d121c] px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/10 ${props.className || ""}`}
    />
  );
}

export default function AiConfigPage() {
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [knowledgeUploading, setKnowledgeUploading] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [knowledgeMessage, setKnowledgeMessage] = useState("");
  const [voiceSearch, setVoiceSearch] = useState("");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [deletingVoiceId, setDeletingVoiceId] = useState("");
  const [deletingKnowledgeId, setDeletingKnowledgeId] = useState("");
  const [previewingVoiceId, setPreviewingVoiceId] = useState("");
  const [loading, setLoading] = useState(true);

  const previewKnowledgeBase = useMemo(
    () =>
      knowledgeBases.find((base) => base.isActive) ||
      knowledgeBases.find((base) => base.status === "ready" && base.chunkCount > 0),
    [knowledgeBases],
  );

  const filteredVoices = useMemo(
    () =>
      voices.filter((voice) =>
        matchesQuery(voice.voiceName || voice.sampleName, voiceSearch) ||
        matchesQuery(voice.sampleName, voiceSearch) ||
        matchesQuery(voice.voiceDescription, voiceSearch),
      ),
    [voices, voiceSearch],
  );

  const filteredKnowledgeBases = useMemo(
    () => knowledgeBases.filter((base) => matchesQuery(base.topic, knowledgeSearch)),
    [knowledgeBases, knowledgeSearch],
  );

  async function loadData() {
    setLoading(true);
    try {
      const [voiceState, knowledgeState, interaction] = await Promise.all([
        fetchVoiceState(),
        fetchKnowledgeState(),
        fetchLiveInteractionSettings(),
      ]);
      setVoices(voiceState.voices || []);
      setKnowledgeBases(knowledgeState.bases || []);
      applySentenceGapSettings(interaction);
    } catch (error) {
      setVoiceMessage(error instanceof ApiError ? error.message : "配置数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    return () => {
      stopVoicePreviewPlayback();
    };
  }, []);

  async function handlePreviewVoice(voice: VoiceProfile) {
    if (!knowledgeBases.length || !previewKnowledgeBase) {
      setVoiceMessage("请先上传知识库素材后再试听");
      return;
    }
    if (previewKnowledgeBase.status !== "ready" || previewKnowledgeBase.chunkCount <= 0) {
      setVoiceMessage("素材尚未就绪，请等待解析完成后再试听");
      return;
    }

    setVoiceMessage("正在按直播方式生成试听内容...");
    stopVoicePreviewPlayback();
    setPreviewingVoiceId(voice.voiceId);

    try {
      const preview = await fetchVoicePreviewItems(voice.voiceId, previewKnowledgeBase.id);
      if (!preview.items?.length) {
        throw new Error("暂无可试听的讲解内容");
      }
      setVoiceMessage(`正在试听「${voice.voiceName || voice.sampleName}」· 素材「${preview.topic || previewKnowledgeBase.topic}」`);
      await playVoicePreviewItems(voice.voiceId, preview.items, {
        onLine: (text) => {
          setVoiceMessage(`试听中：${text}`);
        },
      });
      setVoiceMessage(`试听完成：${voice.voiceName || voice.sampleName}`);
    } catch (error) {
      setVoiceMessage(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "试听失败，请稍后重试");
    } finally {
      stopVoicePreviewPlayback();
      setPreviewingVoiceId("");
    }
  }

  async function handleVoiceFile(file: File) {
    setVoiceMessage("");
    const lower = file.name.toLowerCase();
    if (!AUDIO_ACCEPT.some((ext) => lower.endsWith(ext))) {
      setVoiceMessage("请上传 MP3、WAV 或 M4A 格式的音频文件");
      return;
    }
    if (file.size > AUDIO_MAX_BYTES) {
      setVoiceMessage("单个音频文件不能超过 50MB");
      return;
    }
    if (!voiceName.trim()) {
      setVoiceMessage("请先填写声音名称");
      return;
    }

    setVoiceUploading(true);
    try {
      const result = await uploadVoiceSample(file, voiceName.trim(), voiceDescription.trim());
      setVoices(result.voices || []);
      setVoiceMessage(`音色创建成功：${result.voiceName}`);
      setVoiceName("");
      setVoiceDescription("");
    } catch (error) {
      setVoiceMessage(error instanceof ApiError ? error.message : "音频上传失败，请稍后重试");
    } finally {
      setVoiceUploading(false);
    }
  }

  async function handleKnowledgeFile(file: File) {
    setKnowledgeMessage("");
    const lower = file.name.toLowerCase();
    if (!KNOWLEDGE_ACCEPT.some((ext) => lower.endsWith(ext))) {
      setKnowledgeMessage("请上传 TXT、PDF、DOC 或 DOCX 格式的素材文件");
      return;
    }
    if (!materialName.trim()) {
      setKnowledgeMessage("请先填写素材名称");
      return;
    }

    setKnowledgeUploading(true);
    try {
      const result = await uploadKnowledgeBase(materialName.trim(), file);
      setKnowledgeBases(result.knowledge.bases || []);
      setKnowledgeMessage(`知识库已创建：${result.base.topic}，共 ${result.base.chunkCount} 段内容`);
      setMaterialName("");
      setMaterialDescription("");
    } catch (error) {
      setKnowledgeMessage(error instanceof ApiError ? error.message : "素材上传失败，请稍后重试");
    } finally {
      setKnowledgeUploading(false);
    }
  }

  async function handleActivateVoice(voiceId: string) {
    try {
      const result = await selectVoice(voiceId);
      setVoices(result.voices || []);
      setVoiceMessage(`已切换为音色：${result.voiceName || voiceId}`);
    } catch (error) {
      setVoiceMessage(error instanceof ApiError ? error.message : "音色切换失败");
    }
  }

  async function handleActivateKnowledge(knowledgeBaseId: string) {
    try {
      const result = await selectKnowledgeBase(knowledgeBaseId);
      setKnowledgeBases(result.bases || []);
      const active = result.bases.find((item) => item.id === knowledgeBaseId);
      setKnowledgeMessage(active ? `已切换知识库：${active.topic}` : "知识库已切换");
    } catch (error) {
      setKnowledgeMessage(error instanceof ApiError ? error.message : "知识库切换失败");
    }
  }

  async function handleDeleteVoice(voice: VoiceProfile) {
    const label = voice.voiceName || voice.sampleName || voice.voiceId;
    if (!window.confirm(`确定要删除音色「${label}」吗？删除后无法恢复。`)) {
      return;
    }
    setVoiceMessage("");
    setDeletingVoiceId(voice.voiceId);
    try {
      const result = await deleteVoice(voice.voiceId);
      setVoices(result.voices || []);
      setVoiceMessage(`已删除音色：${label}`);
    } catch (error) {
      setVoiceMessage(error instanceof ApiError ? error.message : "音色删除失败");
    } finally {
      setDeletingVoiceId("");
    }
  }

  async function handleDeleteKnowledge(base: KnowledgeBase) {
    if (!window.confirm(`确定要删除素材「${base.topic}」吗？删除后无法恢复。`)) {
      return;
    }
    setKnowledgeMessage("");
    setDeletingKnowledgeId(base.id);
    try {
      const result = await deleteKnowledgeBase(base.id);
      setKnowledgeBases(result.bases || []);
      setKnowledgeMessage(`已删除素材：${base.topic}`);
    } catch (error) {
      setKnowledgeMessage(error instanceof ApiError ? error.message : "素材删除失败");
    } finally {
      setDeletingKnowledgeId("");
    }
  }

  if (loading) {
    return <div className="text-white/60">正在加载素材配置...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-white/40">智播 AI / 素材配置</div>
        <h1 className="mt-2 text-3xl font-bold">素材配置</h1>
        <p className="mt-2 text-sm text-white/50">管理直播音色与知识库素材，为 AI 口播和弹幕回复提供能力。</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">声音配置</h2>
              <p className="mt-1 text-sm text-white/45">管理并训练 AI 直播员的声音特征</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">已启用</span>
          </div>

          <form className="space-y-4" onSubmit={(event: FormEvent) => event.preventDefault()}>
            <Field label="声音名称" required>
              <Input value={voiceName} onChange={(event) => setVoiceName(event.target.value)} placeholder="请输入声音名称" />
            </Field>
            <Field label="声音描述">
              <Textarea
                value={voiceDescription}
                onChange={(event) => setVoiceDescription(event.target.value)}
                placeholder="请输入声音描述（可选）"
              />
            </Field>
            <UploadDropzone
              title="上传音频（MP3 / WAV）"
              hint="拖拽文件到此处，或点击浏览本地文件"
              acceptText="单个文件最大 50MB"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
              uploading={voiceUploading}
              onFile={handleVoiceFile}
            />
            {voiceMessage ? (
              <div className={`rounded-xl px-4 py-3 text-sm ${voiceMessage.includes("成功") || voiceMessage.includes("已切换") || voiceMessage.includes("已删除") ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200" : "border border-red-500/20 bg-red-500/10 text-red-200"}`}>
                {voiceMessage}
              </div>
            ) : null}
          </form>

          <div className="mt-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium text-white/70">我的音色</div>
              <div className="w-full sm:max-w-xs">
                <SearchInput value={voiceSearch} onChange={setVoiceSearch} placeholder="搜索声音名称..." />
              </div>
            </div>
            <div className="space-y-3">
              {voices.length === 0 ? (
                <div className="rounded-xl border border-white/5 px-4 py-6 text-sm text-white/35">暂无音色，请先上传音频样本</div>
              ) : filteredVoices.length === 0 ? (
                <div className="rounded-xl border border-white/5 px-4 py-6 text-sm text-white/35">没有匹配「{voiceSearch}」的音色</div>
              ) : (
                filteredVoices.map((voice) => (
                  <div key={voice.voiceId} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{voice.voiceName || voice.sampleName}</div>
                      <div className="mt-1 truncate text-xs text-white/40">
                        {voice.sampleName} · {formatRelativeTime(voice.updatedAt || voice.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PreviewButton
                        playing={previewingVoiceId === voice.voiceId}
                        onClick={() => handlePreviewVoice(voice)}
                      />
                      {voice.isActive ? (
                        <span className="rounded-full bg-accent/15 px-2 py-1 text-xs text-accent">当前使用</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleActivateVoice(voice.voiceId)}
                          className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-accent/40 hover:text-white"
                        >
                          启用
                        </button>
                      )}
                      <DeleteButton
                        deleting={deletingVoiceId === voice.voiceId}
                        onClick={() => handleDeleteVoice(voice)}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">知识库配置</h2>
            <p className="mt-1 text-sm text-white/45">上传素材，让 AI 更懂你的业务逻辑</p>
          </div>

          <form className="space-y-4" onSubmit={(event: FormEvent) => event.preventDefault()}>
            <Field label="素材名称" required>
              <Input value={materialName} onChange={(event) => setMaterialName(event.target.value)} placeholder="请输入素材名称" />
            </Field>
            <Field label="素材描述">
              <Textarea
                value={materialDescription}
                onChange={(event) => setMaterialDescription(event.target.value)}
                placeholder="请输入素材描述（可选，仅本地备注）"
              />
            </Field>
            <UploadDropzone
              title="上传素材（TXT / PDF / Word）"
              hint="支持单文件上传，系统会自动提取语义特征"
              acceptText="支持：.txt、.pdf、.doc、.docx"
              accept=".txt,.pdf,.doc,.docx,application/pdf,text/plain"
              uploading={knowledgeUploading}
              onFile={handleKnowledgeFile}
            />
            {knowledgeMessage ? (
              <div className={`rounded-xl px-4 py-3 text-sm ${knowledgeMessage.includes("成功") || knowledgeMessage.includes("已创建") || knowledgeMessage.includes("已切换") || knowledgeMessage.includes("已删除") ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200" : "border border-red-500/20 bg-red-500/10 text-red-200"}`}>
                {knowledgeMessage}
              </div>
            ) : null}
          </form>

          <div className="mt-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium text-white/70">我的素材</div>
              <div className="w-full sm:max-w-xs">
                <SearchInput value={knowledgeSearch} onChange={setKnowledgeSearch} placeholder="搜索素材名称..." />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {knowledgeBases.length === 0 ? (
                <div className="rounded-xl border border-white/5 px-4 py-6 text-sm text-white/35 sm:col-span-2">
                  暂无知识库，请先上传素材文件
                </div>
              ) : filteredKnowledgeBases.length === 0 ? (
                <div className="rounded-xl border border-white/5 px-4 py-6 text-sm text-white/35 sm:col-span-2">
                  没有匹配「{knowledgeSearch}」的素材
                </div>
              ) : (
                filteredKnowledgeBases.map((base) => (
                  <div
                    key={base.id}
                    className={`rounded-2xl border px-4 py-4 transition ${
                      base.isActive
                        ? "border-accent/40 bg-accent/10"
                        : "border-white/5 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleActivateKnowledge(base.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate font-medium text-white">{base.topic}</div>
                        <div className="mt-2 text-xs text-white/40">
                          {statusLabel(base.status)} · {base.chunkCount} 段 · {formatRelativeTime(base.updatedAt || base.createdAt)}
                        </div>
                        {base.isActive ? <div className="mt-3 text-xs text-accent">当前使用</div> : null}
                      </button>
                      <DeleteButton
                        deleting={deletingKnowledgeId === base.id}
                        onClick={() => handleDeleteKnowledge(base)}
                      />
                    </div>
                    {!base.isActive ? (
                      <button
                        type="button"
                        onClick={() => handleActivateKnowledge(base.id)}
                        className="mt-3 rounded-lg border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-accent/40 hover:text-white"
                      >
                        启用
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
