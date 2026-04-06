import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useNavigate, useParams } from "react-router";
import { InspectorPanel } from "../components/InspectorPanel";
import { OutlineSidebar } from "../components/OutlineSidebar";
import { SegmentListEditor } from "../components/SegmentListEditor";
import { SlideCanvas } from "../components/SlideCanvas";
import type { Segment } from "../hooks/useTranslation";
import { useTranslation } from "../hooks/useTranslation";
import type { FileRecord } from "../lib/db";
import { getDB } from "../lib/db";
import {
  type SlideLayout,
  extractSegments,
  extractVisualLayout,
  reconstructFile,
  revokeImageUrls,
} from "../lib/parser-client";
import {
  addTranslationMemoryEntry,
  findTranslationMemoryMatch,
} from "../lib/translation-memory";

export function meta() {
  return [{ title: "Translate - offline.cat" }];
}

const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "es", name: "Spanish" },
  { id: "fr", name: "French" },
  { id: "de", name: "German" },
  { id: "it", name: "Italian" },
  { id: "pt", name: "Portuguese" },
  { id: "nl", name: "Dutch" },
  { id: "ja", name: "Japanese" },
  { id: "ko", name: "Korean" },
  { id: "zh", name: "Chinese" },
];

export default function Translate() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [slideLayouts, setSlideLayouts] = useState<SlideLayout[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [fileType, setFileType] = useState("");
  const fileDataRef = useRef<{ data: Uint8Array; ext: string } | null>(null);
  const { segments, setSegments, isTranslating, error, translate, cancel } =
    useTranslation();

  // Load file from SQLite
  useEffect(() => {
    const loadFile = async () => {
      const db = await getDB();
      const file = await db.getOne<FileRecord>(
        "SELECT * FROM files WHERE id = ?",
        [fileId!],
      );
      if (!file) {
        navigate("/");
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

      const rawSegments = await extractSegments(data, ext);

      if (ext === "pptx") {
        const result = await extractVisualLayout(data, ext);
        setSlideLayouts(result.layouts);
        setImageUrls(result.imageUrls);
      }

      const processed: Segment[] = await Promise.all(
        rawSegments.map(async (segment) => {
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

    loadFile();
  }, [fileId, navigate, sourceLanguage, targetLanguage, setSegments]);

  // Revoke blob URLs on cleanup
  useEffect(() => {
    return () => {
      revokeImageUrls(imageUrls);
    };
  }, [imageUrls]);

  const handleTranslate = useCallback(() => {
    translate(segments, sourceLanguage, targetLanguage);
  }, [segments, sourceLanguage, targetLanguage, translate]);

  const handleConfirm = useCallback(
    async (segmentId: string, translation: string) => {
      const segment = segments.find((s) => s.id === segmentId);
      if (!segment) return;

      await addTranslationMemoryEntry(
        segment.source,
        translation,
        sourceLanguage,
        targetLanguage,
        "HUMAN",
      );

      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId
            ? { ...s, target: translation, origin: "user" as const }
            : s,
        ),
      );
    },
    [segments, sourceLanguage, targetLanguage, setSegments],
  );

  const handleTargetChange = useCallback(
    (segmentId: string, value: string) => {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId ? { ...s, target: value } : s,
        ),
      );
    },
    [setSegments],
  );

  const handleSegmentClick = useCallback(
    (segmentId: string) => {
      setActiveSegmentId(segmentId);
      // Find which slide this segment belongs to
      for (const layout of slideLayouts) {
        const found = layout.regions.some(
          (region) => region.segmentId === segmentId,
        );
        if (found) {
          setActiveSlide(
            slideLayouts.findIndex(
              (l) => l.slideIndex === layout.slideIndex,
            ),
          );
          break;
        }
      }
    },
    [slideLayouts],
  );

  const handleDownload = useCallback(async () => {
    const fileInfo = fileDataRef.current;
    if (!fileInfo) return;

    const translations = new Map<string, string>();
    for (const segment of segments) {
      if (segment.target) {
        translations.set(segment.id, segment.target);
      }
    }

    const result = await reconstructFile(
      fileInfo.data,
      fileInfo.ext,
      translations,
    );

    const mimeTypes: Record<string, string> = {
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      html: "text/html",
      htm: "text/html",
      xliff: "application/xml",
      xlf: "application/xml",
    };

    const baseName = fileName.replace(/\.[^.]+$/, "");
    const outputName = `${baseName}_${targetLanguage}.${fileInfo.ext}`;
    const outputBlob = new Blob([result as BlobPart], {
      type: mimeTypes[fileInfo.ext] ?? "application/octet-stream",
    });

    const url = URL.createObjectURL(outputBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = outputName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [segments, fileName, targetLanguage]);

  const stats = useMemo(() => {
    const total = segments.length;
    const translated = segments.filter((s) => s.target).length;
    const confirmed = segments.filter((s) => s.origin === "user").length;
    return { total, translated, confirmed };
  }, [segments]);

  const activeSegment = activeSegmentId
    ? segments.find((s) => s.id === activeSegmentId) ?? null
    : null;

  const hasCanvas = slideLayouts.length > 0;
  const currentLayout = slideLayouts[activeSlide];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onPress={() => navigate("/")}
              className="text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer"
            >
              &larr; Back
            </Button>
            <span className="font-medium text-sm">{fileName}</span>
            {stats.total > 0 && (
              <span className="text-xs text-gray-500">
                {stats.translated}/{stats.total} translated &middot;{" "}
                {stats.confirmed} confirmed
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <span className="text-gray-400">&rarr;</span>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <Button
              onPress={isTranslating ? cancel : handleTranslate}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer ${
                isTranslating
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
              }`}
            >
              {isTranslating ? "Cancel" : "Translate"}
            </Button>

            <Button
              onPress={handleDownload}
              isDisabled={stats.translated === 0}
              className="px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download
            </Button>
          </div>
        </div>

        {/* Slide tabs */}
        {hasCanvas && slideLayouts.length > 1 && (
          <div className="flex gap-1 mt-2">
            {slideLayouts.map((layout, index) => (
              <button
                key={layout.slideIndex}
                type="button"
                onClick={() => setActiveSlide(index)}
                className={`px-2.5 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                  index === activeSlide
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Error */}
      {error && (
        <div className="shrink-0 px-4 py-2">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Three-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - outline */}
        <div className="w-56 shrink-0 border-r dark:border-gray-800 overflow-hidden">
          <OutlineSidebar
            segments={segments}
            layouts={slideLayouts}
            fileType={fileType}
            activeSegmentId={activeSegmentId}
            onSegmentClick={handleSegmentClick}
          />
        </div>

        {/* Center - canvas */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
          {segments.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400">No translatable segments found.</p>
            </div>
          ) : hasCanvas && currentLayout ? (
            <SlideCanvas
              layout={currentLayout}
              segments={segments}
              activeSegmentId={activeSegmentId}
              onSegmentFocus={setActiveSegmentId}
              onTargetChange={handleTargetChange}
              onConfirm={handleConfirm}
              imageUrls={imageUrls}
            />
          ) : (
            <SegmentListEditor
              segments={segments}
              activeSegmentId={activeSegmentId}
              onSegmentFocus={setActiveSegmentId}
              onTargetChange={handleTargetChange}
              onConfirm={handleConfirm}
            />
          )}
        </div>

        {/* Right sidebar - inspector */}
        <div className="w-60 shrink-0 border-l dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
          <InspectorPanel
            segment={activeSegment}
            onConfirm={handleConfirm}
          />
        </div>
      </div>
    </div>
  );
}
