import { useCallback, useRef, useState } from "react";
import { translateSegments } from "../lib/translator";

export interface Segment {
  id: string;
  source: string;
  target?: string;
  origin?: "translationMemory" | "ai" | "user";
  translationMemorySuggestion?: string;
  translationMemoryScore?: number;
  needsTranslation?: boolean;
}

export function useTranslation() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setIsTranslating(false);
  }, []);

  const translate = useCallback(
    async (
      inputSegments: Segment[],
      sourceLanguage: string,
      targetLanguage: string,
    ) => {
      cancel();
      setError(null);

      controllerRef.current = new AbortController();
      setIsTranslating(true);
      setSegments(inputSegments);

      const toTranslate = inputSegments.filter(
        (segment) => segment.needsTranslation,
      );
      if (toTranslate.length === 0) {
        setIsTranslating(false);
        return;
      }

      try {
        await translateSegments(
          toTranslate.map((segment) => ({
            id: segment.id,
            source: segment.source,
          })),
          sourceLanguage,
          targetLanguage,
          controllerRef.current.signal,
          (result) => {
            setSegments((prev) =>
              prev.map((segment) =>
                segment.id === result.id
                  ? {
                      ...segment,
                      target: result.translation,
                      origin: "ai" as const,
                    }
                  : segment,
              ),
            );
          },
        );
      } catch (translationError) {
        if (translationError instanceof Error) {
          if (translationError.name !== "AbortError") {
            setError(translationError.message);
          }
        }
      } finally {
        setIsTranslating(false);
      }
    },
    [cancel],
  );

  return { segments, setSegments, isTranslating, error, translate, cancel };
}
