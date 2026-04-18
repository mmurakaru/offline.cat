import type { TranslateResult, TranslationEngine } from "./types";

interface TranslateProgressPayload {
  id: string;
  translation: string;
}

interface TranslateArgs {
  segments: { id: string; source: string }[];
  sourceLang: string;
  targetLang: string;
}

async function loadTauriCore() {
  return await import("@tauri-apps/api/core");
}

async function getActiveModelId(): Promise<string | null> {
  try {
    const { invoke } = await loadTauriCore();
    return await invoke<string | null>("active_model");
  } catch {
    return null;
  }
}

async function isAvailable(): Promise<boolean> {
  const id = await getActiveModelId();
  return id !== null;
}

async function translate(
  segments: { id: string; source: string }[],
  sourceLanguage: string,
  targetLanguage: string,
  signal: AbortSignal,
  onProgress: (result: TranslateResult) => void,
): Promise<TranslateResult[]> {
  if (segments.length === 0) return [];

  const activeId = await getActiveModelId();
  if (!activeId) {
    throw new Error(
      "No model loaded. Download and select a model in Settings before translating.",
    );
  }

  if (!sourceLanguage || !targetLanguage) {
    throw new Error("Source and target languages must be selected.");
  }

  const { Channel, invoke } = await loadTauriCore();

  const channel = new Channel<TranslateProgressPayload>();
  channel.onmessage = (payload) => {
    onProgress({ id: payload.id, translation: payload.translation });
  };

  const onAbort = () => {
    invoke("cancel_translate").catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const args: TranslateArgs = {
      segments,
      sourceLang: sourceLanguage,
      targetLang: targetLanguage,
    };
    const results = await invoke<TranslateProgressPayload[]>("translate", {
      args,
      onProgress: channel,
    });
    return results.map((r) => ({ id: r.id, translation: r.translation }));
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export const llamaCppEngine: TranslationEngine = {
  id: "llama-cpp",
  isAvailable,
  translate,
};
