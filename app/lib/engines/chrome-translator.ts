import type { TranslateResult, TranslationEngine } from "./types";

interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy(): void;
}

interface TranslatorConstructor {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<"available" | "downloadable" | "unavailable">;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<TranslatorInstance>;
}

declare const Translator: TranslatorConstructor | undefined;

async function isAvailable(
  sourceLanguage: string,
  targetLanguage: string,
): Promise<boolean> {
  if (typeof Translator === "undefined") return false;
  if (!sourceLanguage || !targetLanguage) return false;

  const availability = await Translator.availability({
    sourceLanguage,
    targetLanguage,
  });
  return availability !== "unavailable";
}

async function translate(
  segments: { id: string; source: string }[],
  sourceLanguage: string,
  targetLanguage: string,
  signal: AbortSignal,
  onProgress: (result: TranslateResult) => void,
): Promise<TranslateResult[]> {
  if (typeof Translator === "undefined") {
    throw new Error(
      "Translator API not available. Requires Chrome 138+ with language packs installed.",
    );
  }

  if (!sourceLanguage || !targetLanguage) {
    throw new Error("Source and target languages must be selected.");
  }

  const translator = await Translator.create({
    sourceLanguage,
    targetLanguage,
  });

  const results: TranslateResult[] = [];

  try {
    for (const segment of segments) {
      if (signal.aborted) break;

      const translation = await translator.translate(segment.source);
      const result = { id: segment.id, translation };
      results.push(result);
      onProgress(result);
    }
  } finally {
    translator.destroy();
  }

  return results;
}

export const chromeTranslatorEngine: TranslationEngine = {
  id: "chrome",
  isAvailable,
  translate,
};
