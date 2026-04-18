import { useEffect, useRef, useState } from "react";
import type { FileRecord } from "../lib/db";
import { getDB } from "../lib/db";
import type { EditorModel } from "../lib/ice/editor-model";
import { detectLanguage } from "../lib/language-detector";
import { parseFile, revokeImageUrls } from "../lib/parser-client";
import { findTranslationMemoryMatch } from "../lib/translation-memory";
import type { Segment } from "./useTranslation";

interface UseFileParsingOptions {
  fileId: string | undefined;
  sourceLanguage: string;
  targetLanguage: string;
  onNavigateAway: () => void;
  setSegments: (
    segments: Segment[] | ((previous: Segment[]) => Segment[]),
  ) => void;
}

interface UseFileParsingResult {
  fileName: string;
  fileType: string;
  editorModel: EditorModel | null;
  imageUrls: Map<string, string>;
  sourceLanguage: string;
  setSourceLanguage: (language: string) => void;
  unsupportedSource: boolean;
  fileData: { data: Uint8Array; ext: string } | null;
}

export function useFileParsing({
  fileId,
  sourceLanguage: externalSourceLanguage,
  targetLanguage,
  onNavigateAway,
  setSegments,
}: UseFileParsingOptions): UseFileParsingResult {
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [editorModel, setEditorModel] = useState<EditorModel | null>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [sourceLanguage, setSourceLanguage] = useState(externalSourceLanguage);
  const [unsupportedSource, setUnsupportedSource] = useState(false);
  const fileDataRef = useRef<{ data: Uint8Array; ext: string } | null>(null);

  useEffect(() => {
    const loadFile = async () => {
      const db = await getDB();
      const file = await db.getOne<FileRecord>(
        "SELECT * FROM files WHERE id = ?",
        [fileId!],
      );
      if (!file) {
        onNavigateAway();
        return;
      }

      setFileName(file.name);

      const data =
        file.data instanceof Uint8Array
          ? file.data
          : new Uint8Array(file.data as ArrayBuffer);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      fileDataRef.current = { data, ext };
      setFileType(ext);

      // Single parseFile call: segments + editor model + images
      const result = await parseFile(data, ext);

      setEditorModel(result.editorModel);
      setImageUrls(result.imageUrls);

      // Auto-detect source language from first segments. When the
      // LanguageDetector API isn't available (e.g. Tauri webview, Firefox),
      // leave the language unset and let the user pick manually - don't flag
      // it as unsupported.
      if (!sourceLanguage && result.segments.length > 0) {
        const detectorAvailable = "LanguageDetector" in globalThis;
        if (detectorAvailable) {
          const sampleText = result.segments
            .slice(0, 10)
            .map((segment) => segment.source)
            .join(" ");
          const detected = await detectLanguage(sampleText);
          if (detected) {
            setSourceLanguage(detected);
            setUnsupportedSource(false);
          } else {
            setUnsupportedSource(true);
          }
        }
      }

      // Apply translation memory matches
      const processed: Segment[] = await Promise.all(
        result.segments.map(async (segment) => {
          const match = await findTranslationMemoryMatch(
            segment.source,
            sourceLanguage,
            targetLanguage,
          );

          if (match.score >= 95) {
            return {
              ...segment,
              target: match.translation,
              origin: "translationMemory" as const,
              translationMemoryScore: match.score,
            };
          }

          if (match.score >= 75) {
            return {
              ...segment,
              translationMemorySuggestion: match.translation,
              translationMemoryScore: match.score,
              needsTranslation: true,
            };
          }

          return { ...segment, needsTranslation: true };
        }),
      );

      setSegments(processed);
    };

    loadFile().catch((error) => {
      console.error("Failed to load file:", error);
    });
  }, [fileId, sourceLanguage, targetLanguage, setSegments, onNavigateAway]);

  // Revoke blob URLs on cleanup
  useEffect(() => {
    return () => {
      revokeImageUrls(imageUrls);
    };
  }, [imageUrls]);

  return {
    fileName,
    fileType,
    editorModel,
    imageUrls,
    sourceLanguage,
    setSourceLanguage,
    unsupportedSource,
    fileData: fileDataRef.current,
  };
}
