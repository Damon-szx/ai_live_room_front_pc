export type SpeechRatePreset = "slow" | "normal" | "fast";

const STORAGE_KEY = "ai-live:speech-rate-preset";

/** 较慢：与项目原有默认一致；正常：不减速；较快：略快于正常 */
const PRESET_CONFIG: Record<
  SpeechRatePreset,
  { label: string; ttsSpeechRate: number; playbackRate: number | null }
> = {
  slow: { label: "较慢", ttsSpeechRate: 0.86, playbackRate: null },
  normal: { label: "正常", ttsSpeechRate: 1, playbackRate: 1 },
  fast: { label: "较快", ttsSpeechRate: 1.08, playbackRate: 1.08 },
};

export const SPEECH_RATE_PRESET_OPTIONS: Array<{ value: SpeechRatePreset; label: string }> = (
  Object.entries(PRESET_CONFIG) as Array<[SpeechRatePreset, (typeof PRESET_CONFIG)[SpeechRatePreset]]>
).map(([value, config]) => ({ value, label: config.label }));

function isSpeechRatePreset(value: string): value is SpeechRatePreset {
  return value === "slow" || value === "normal" || value === "fast";
}

export function getSpeechRatePreset(): SpeechRatePreset {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isSpeechRatePreset(stored)) {
      return stored;
    }
  } catch {
    // localStorage 不可用时回退默认
  }
  return "slow";
}

export function setSpeechRatePreset(preset: SpeechRatePreset) {
  try {
    localStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // 忽略写入失败
  }
}

/** 传给后端 TTS 接口的合成语速 */
export function getTtsApiSpeechRate(preset = getSpeechRatePreset()) {
  return PRESET_CONFIG[preset].ttsSpeechRate;
}

type PlaybackRateItem = {
  speechRate?: number;
  kind?: string;
};

/** 播放阶段最终 playbackRate；较慢档保留逐句随机微调 */
export function resolvePlaybackRate(item: PlaybackRateItem, preset = getSpeechRatePreset()) {
  const config = PRESET_CONFIG[preset];
  if (config.playbackRate != null) {
    return config.playbackRate;
  }
  if (typeof item.speechRate === "number" && item.speechRate > 0) {
    return Math.min(1.05, Math.max(0.72, item.speechRate));
  }
  return item.kind === "reply" ? 0.82 : 0.86;
}
