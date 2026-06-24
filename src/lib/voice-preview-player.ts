import { synthesizeVoicePreviewLine, type VoicePreviewItem } from "./ai-config-api";
import { resolveSentenceGapMs } from "./playback-gap";
import { resolvePlaybackRate } from "./speech-rate";

const PREFETCH_AHEAD = 3;

let previewSession = 0;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl = "";
const prefetchPromises = new Map<string, Promise<Blob | null>>();

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resolveSpeechRate(item: VoicePreviewItem) {
  return resolvePlaybackRate(item);
}

function itemKey(item: VoicePreviewItem) {
  return item.id || item.text;
}

function clearPrefetch() {
  prefetchPromises.clear();
}

function schedulePrefetch(voiceId: string, items: VoicePreviewItem[], fromIndex: number, session: number) {
  const end = Math.min(items.length, fromIndex + PREFETCH_AHEAD);
  for (let index = fromIndex; index < end; index += 1) {
    const item = items[index];
    const key = itemKey(item);
    if (prefetchPromises.has(key)) {
      continue;
    }
    prefetchPromises.set(
      key,
      synthesizeVoicePreviewLine(voiceId, item.text)
        .then((blob) => (session === previewSession ? blob : null))
        .catch((error) => {
          prefetchPromises.delete(key);
          throw error;
        }),
    );
  }
}

async function takePreparedBlob(voiceId: string, item: VoicePreviewItem, session: number) {
  const key = itemKey(item);
  let promise = prefetchPromises.get(key);
  if (!promise) {
    promise = synthesizeVoicePreviewLine(voiceId, item.text).then((blob) =>
      session === previewSession ? blob : null,
    );
  } else {
    prefetchPromises.delete(key);
  }
  const blob = await promise;
  if (!blob || session !== previewSession) {
    return null;
  }
  return blob;
}

function playBlob(blob: Blob, speechRate: number) {
  return new Promise<void>((resolve) => {
    if (currentAudio) {
      currentAudio.pause();
    }
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
    }
    currentAudioUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentAudioUrl);
    currentAudio.playbackRate = speechRate;
    currentAudio.onended = () => {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudio = null;
      currentAudioUrl = "";
      resolve();
    };
    currentAudio.onerror = () => {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudio = null;
      currentAudioUrl = "";
      resolve();
    };
    currentAudio.play().catch(() => {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudio = null;
      currentAudioUrl = "";
      resolve();
    });
  });
}

export function stopVoicePreviewPlayback() {
  previewSession += 1;
  clearPrefetch();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = "";
  }
}

export async function playVoicePreviewItems(
  voiceId: string,
  items: VoicePreviewItem[],
  callbacks?: {
    onLine?: (text: string) => void;
  },
) {
  const session = previewSession;
  clearPrefetch();
  schedulePrefetch(voiceId, items, 0, session);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (session !== previewSession) {
      return;
    }

    schedulePrefetch(voiceId, items, index + 1, session);

    if (item.leadPauseMs) {
      await delay(item.leadPauseMs);
    }
    if (session !== previewSession) {
      return;
    }

    callbacks?.onLine?.(item.text);
    const blob = await takePreparedBlob(voiceId, item, session);
    if (!blob || session !== previewSession) {
      return;
    }

    await playBlob(blob, resolveSpeechRate(item));
    if (session !== previewSession) {
      return;
    }

    if (index < items.length - 1) {
      const gapMs = resolveSentenceGapMs(item.pauseMs);
      if (gapMs) {
        await delay(gapMs);
      }
    }
  }
}
