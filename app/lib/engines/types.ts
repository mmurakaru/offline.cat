export interface TranslateResult {
  id: string;
  translation: string;
}

export interface TranslationEngine {
  id: "chrome" | "llama-cpp";
  isAvailable(sourceLanguage: string, targetLanguage: string): Promise<boolean>;
  translate(
    segments: { id: string; source: string }[],
    sourceLanguage: string,
    targetLanguage: string,
    signal: AbortSignal,
    onProgress: (result: TranslateResult) => void,
  ): Promise<TranslateResult[]>;
}
