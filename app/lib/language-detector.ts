declare global {
  interface LanguageDetectorResult {
    detectedLanguage: string;
    confidence: number;
  }

  interface LanguageDetectorInstance {
    detect(text: string): Promise<LanguageDetectorResult[]>;
  }

  const LanguageDetector: {
    create(): Promise<LanguageDetectorInstance>;
  };
}

const SUPPORTED_SOURCES = new Set([
  "ar",
  "bg",
  "bn",
  "cs",
  "da",
  "de",
  "el",
  "en",
]);

export async function detectLanguage(text: string): Promise<string | null> {
  if (!("LanguageDetector" in self)) return null;

  try {
    const detector = await LanguageDetector.create();
    const results = await detector.detect(text);

    if (results.length === 0) return null;

    const best = results[0];
    if (best.confidence < 0.5) return null;

    if (SUPPORTED_SOURCES.has(best.detectedLanguage)) {
      return best.detectedLanguage;
    }

    return null;
  } catch {
    return null;
  }
}
