import { getActiveEngine } from "./engines/registry";
import type { TranslateResult } from "./engines/types";

export type { TranslateResult };

export function isTranslatorAvailable(
  sourceLanguage: string,
  targetLanguage: string,
): Promise<boolean> {
  return getActiveEngine().isAvailable(sourceLanguage, targetLanguage);
}

export function translateSegments(
  segments: { id: string; source: string }[],
  sourceLanguage: string,
  targetLanguage: string,
  signal: AbortSignal,
  onProgress: (result: TranslateResult) => void,
): Promise<TranslateResult[]> {
  return getActiveEngine().translate(
    segments,
    sourceLanguage,
    targetLanguage,
    signal,
    onProgress,
  );
}
