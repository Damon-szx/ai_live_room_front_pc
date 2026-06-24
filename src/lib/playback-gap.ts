export const MAX_SENTENCE_GAP_MS = 3000;
export const DEFAULT_SENTENCE_GAP_MIN_MS = 500;
export const DEFAULT_SENTENCE_GAP_MAX_MS = 1000;

let gapMinMs = DEFAULT_SENTENCE_GAP_MIN_MS;
let gapMaxMs = DEFAULT_SENTENCE_GAP_MAX_MS;

export function normalizeSentenceGapRange(minMs: number, maxMs: number) {
  const minVal = Math.max(0, Math.min(minMs, MAX_SENTENCE_GAP_MS));
  const maxVal = Math.max(minVal, Math.min(maxMs, MAX_SENTENCE_GAP_MS));
  return { minMs: minVal, maxMs: maxVal };
}

export function setSentenceGapRange(minMs: number, maxMs: number) {
  const normalized = normalizeSentenceGapRange(minMs, maxMs);
  gapMinMs = normalized.minMs;
  gapMaxMs = normalized.maxMs;
}

export function getSentenceGapRange() {
  return { minMs: gapMinMs, maxMs: gapMaxMs };
}

export function applySentenceGapSettings(settings: {
  sentenceGapMinMs?: number;
  sentenceGapMaxMs?: number;
}) {
  setSentenceGapRange(
    settings.sentenceGapMinMs ?? DEFAULT_SENTENCE_GAP_MIN_MS,
    settings.sentenceGapMaxMs ?? DEFAULT_SENTENCE_GAP_MAX_MS,
  );
}

/** 句与句之间留空：在配置范围内随机，每次播放重新取值 */
export function resolveSentenceGapMs(_pauseMs?: number) {
  if (gapMaxMs <= 0) {
    return 0;
  }
  if (gapMinMs >= gapMaxMs) {
    return gapMinMs;
  }
  return gapMinMs + Math.floor(Math.random() * (gapMaxMs - gapMinMs + 1));
}
