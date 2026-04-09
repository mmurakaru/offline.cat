import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";
import { useNavigate, useParams } from "react-router";
import { InspectorPanel } from "../components/InspectorPanel";
import { NavigatorSidebar } from "../components/NavigatorSidebar";
import { OutlineSidebar } from "../components/OutlineSidebar";
import { SegmentListEditor } from "../components/SegmentListEditor";
import {
  type SidebarMode,
  SidebarViewToggle,
} from "../components/SidebarViewToggle";
import { SlideCanvas } from "../components/SlideCanvas";
import type { Segment } from "../hooks/useTranslation";
import { useTranslation } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import type { FileRecord } from "../lib/db";
import { getDB } from "../lib/db";
import {
  extractSegments,
  extractVisualLayout,
  reconstructFile,
  revokeImageUrls,
  type SlideLayout,
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

function getFileTypeBadge(filename: string): {
  label: string;
  className: string;
} {
  const extension = filename.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pptx":
    case "ppt":
      return { label: "PPTX", className: "bg-[#FA8072] text-white" };
    case "docx":
    case "doc":
      return { label: "DOCX", className: "bg-blue-500 text-white" };
    case "xliff":
    case "xlf":
      return { label: "XLIFF", className: "bg-green-500 text-white" };
    case "pdf":
      return { label: "PDF", className: "bg-red-500 text-white" };
    default:
      return {
        label: (extension ?? "").toUpperCase(),
        className: "bg-gray-500 text-white",
      };
  }
}

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
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("navigator");
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
        prev.map((s) => (s.id === segmentId ? { ...s, target: value } : s)),
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
            slideLayouts.findIndex((l) => l.slideIndex === layout.slideIndex),
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
    ? (segments.find((s) => s.id === activeSegmentId) ?? null)
    : null;

  const handleSlideClick = useCallback(
    (slideIndex: number) => {
      setActiveSlide(slideIndex);
      const layout = slideLayouts[slideIndex];
      if (layout?.regions.length > 0) {
        setActiveSegmentId(layout.regions[0].segmentId);
      }
    },
    [slideLayouts],
  );

  const hasCanvas = slideLayouts.length > 0;
  const currentLayout = slideLayouts[activeSlide];

  const fileTypeBadge = getFileTypeBadge(fileName);
  const displayName = fileType
    ? fileName.replace(new RegExp(`\\.${fileType}$`, "i"), "")
    : fileName;

  return (
    <div className="h-screen flex">
      {/* Left sidebar - full height */}
      <div className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden pt-11">
          {hasCanvas && sidebarMode === "navigator" ? (
            <NavigatorSidebar
              layouts={slideLayouts}
              segments={segments}
              activeSlide={activeSlide}
              imageUrls={imageUrls}
              onSlideClick={handleSlideClick}
            />
          ) : (
            <OutlineSidebar
              segments={segments}
              layouts={slideLayouts}
              fileType={fileType}
              activeSegmentId={activeSegmentId}
              onSegmentClick={handleSegmentClick}
            />
          )}
        </div>
      </div>

      {/* Right portion - header + content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hasCanvas && (
                <SidebarViewToggle
                  mode={sidebarMode}
                  onModeChange={setSidebarMode}
                />
              )}
              <Button
                onPress={() => navigate("/")}
                className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-gray-500 dark:text-gray-400 transition-colors"
                aria-label="Back to home"
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </Button>
              <span className="font-medium text-sm">{displayName}</span>
              {fileTypeBadge.label && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                    fileTypeBadge.className,
                  )}
                >
                  {fileTypeBadge.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Select
                aria-label="Source language"
                selectedKey={sourceLanguage}
                onSelectionChange={(key) => setSourceLanguage(key as string)}
              >
                <Button className="w-[120px] flex items-center justify-between gap-1.5 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
                  <SelectValue />
                  <svg
                    aria-hidden="true"
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-400"
                  >
                    <path d="M2.5 4L5 6.5L7.5 4" />
                  </svg>
                </Button>
                <Popover className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[var(--trigger-width)]">
                  <ListBox className="outline-none max-h-60 overflow-auto">
                    {LANGUAGES.map((language) => (
                      <ListBoxItem
                        key={language.id}
                        id={language.id}
                        className="px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 data-[selected]:font-medium data-[focused]:bg-gray-100 dark:data-[focused]:bg-gray-800"
                      >
                        {language.name}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Popover>
              </Select>
              <span className="text-gray-400">&rarr;</span>
              <Select
                aria-label="Target language"
                selectedKey={targetLanguage}
                onSelectionChange={(key) => setTargetLanguage(key as string)}
              >
                <Button className="w-[120px] flex items-center justify-between gap-1.5 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
                  <SelectValue />
                  <svg
                    aria-hidden="true"
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-400"
                  >
                    <path d="M2.5 4L5 6.5L7.5 4" />
                  </svg>
                </Button>
                <Popover className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[var(--trigger-width)]">
                  <ListBox className="outline-none max-h-60 overflow-auto">
                    {LANGUAGES.map((language) => (
                      <ListBoxItem
                        key={language.id}
                        id={language.id}
                        className="px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 data-[selected]:font-medium data-[focused]:bg-gray-100 dark:data-[focused]:bg-gray-800"
                      >
                        {language.name}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Popover>
              </Select>

              <Button
                onPress={isTranslating ? cancel : handleTranslate}
                className={cn(
                  "p-2 rounded-lg cursor-pointer transition-colors",
                  isTranslating
                    ? "text-red-500 hover:bg-red-500/10 active:bg-red-500/15"
                    : "text-gray-500 dark:text-gray-400 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15",
                )}
                aria-label={isTranslating ? "Cancel translation" : "Translate"}
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7h11l-4-4" />
                  <path d="M20 17H9l4 4" />
                </svg>
              </Button>

              <Button
                onPress={handleDownload}
                isDisabled={stats.translated === 0}
                className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Download translated file"
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </Button>
            </div>
          </div>
        </header>

        {/* Error */}
        {error && (
          <div className="shrink-0 px-4 py-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Canvas + Right sidebar */}
        <div className="flex-1 flex overflow-hidden">
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
            <InspectorPanel segment={activeSegment} onConfirm={handleConfirm} />
          </div>
        </div>
      </div>
    </div>
  );
}
