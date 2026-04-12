import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowRightIcon } from "../components/arrow-right-icon";
import { DownloadIcon } from "../components/download-icon";
import { InspectorPanel } from "../components/InspectorPanel";
import { LoadingIcon } from "../components/loading-icon";
import { NavigatorSidebar } from "../components/NavigatorSidebar";
import { OutlineSidebar } from "../components/OutlineSidebar";
import { OfflineIcon } from "../components/offline-icon";
import { PlusIcon } from "../components/plus-icon";
import { SegmentListEditor } from "../components/SegmentListEditor";
import {
  type SidebarMode,
  SidebarViewToggle,
} from "../components/SidebarViewToggle";
import { SlideCanvas } from "../components/SlideCanvas";
import { TranslateIcon } from "../components/translate-icon";
import { useEditorHotkeys } from "../hooks/useEditorHotkeys";
import type { Segment } from "../hooks/useTranslation";
import { useTranslation } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import type { FileRecord } from "../lib/db";
import { getDB } from "../lib/db";
import { detectLanguage } from "../lib/language-detector";
import { translateSegments } from "../lib/translator";
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

const LANGUAGES: Record<string, string> = {
  ar: "Arabic",
  bg: "Bulgarian",
  bn: "Bengali",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fi: "Finnish",
  fr: "French",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  iw: "Hebrew",
  ja: "Japanese",
  kn: "Kannada",
  ko: "Korean",
  lt: "Lithuanian",
  mr: "Marathi",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  sl: "Slovenian",
  sv: "Swedish",
  ta: "Tamil",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  zh: "Chinese",
  "zh-Hant": "Chinese (Traditional)",
};

// Chrome Translation API language pairs - direction matters
const LANGUAGE_PAIRS: [string, string][] = [
  // en -> X
  ["en", "es"],
  ["en", "ja"],
  ["en", "fr"],
  ["en", "hi"],
  ["en", "it"],
  ["en", "ko"],
  ["en", "nl"],
  ["en", "pl"],
  ["en", "pt"],
  ["en", "ru"],
  ["en", "th"],
  ["en", "tr"],
  ["en", "vi"],
  ["en", "zh"],
  ["en", "zh-Hant"],
  ["en", "fi"],
  ["en", "hr"],
  ["en", "hu"],
  ["en", "id"],
  ["en", "iw"],
  ["en", "lt"],
  ["en", "no"],
  ["en", "ro"],
  ["en", "sk"],
  ["en", "sl"],
  ["en", "sv"],
  ["en", "uk"],
  ["en", "kn"],
  ["en", "ta"],
  ["en", "te"],
  ["en", "mr"],
  // X -> en
  ["ar", "en"],
  ["bn", "en"],
  ["de", "en"],
  ["bg", "en"],
  ["cs", "en"],
  ["da", "en"],
  ["el", "en"],
];

function getSourceLanguages() {
  const sources = new Set(LANGUAGE_PAIRS.map(([source]) => source));
  return [...sources]
    .map((id) => ({ id, name: LANGUAGES[id] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getTargetLanguages(sourceLanguage: string) {
  if (!sourceLanguage) {
    const targets = new Set(LANGUAGE_PAIRS.map(([_source, target]) => target));
    return [...targets]
      .map((id) => ({ id, name: LANGUAGES[id] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return LANGUAGE_PAIRS.filter(([source]) => source === sourceLanguage)
    .map(([_source, target]) => ({ id: target, name: LANGUAGES[target] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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
      return { label: "DOCX", className: "bg-primary-5 text-white" };
    case "xliff":
    case "xlf":
      return { label: "XLIFF", className: "bg-green-500 text-white" };
    case "pdf":
      return { label: "PDF", className: "bg-red-500 text-white" };
    default:
      return {
        label: (extension ?? "").toUpperCase(),
        className: "bg-grey-7 text-white",
      };
  }
}

export default function Translate() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [unsupportedSource, setUnsupportedSource] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [slideLayouts, setSlideLayouts] = useState<SlideLayout[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [fileType, setFileType] = useState("");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("navigator");
  const [isDownloading, setIsDownloading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [zoomPercent, setZoomPercent] = useState<number | "fit">("fit");
  const [resetViewKey, setResetViewKey] = useState(0);
  const fileDataRef = useRef<{ data: Uint8Array; ext: string } | null>(null);
  const { segments, setSegments, isTranslating, translate } = useTranslation();

  // Load file from SQLite
  useEffect(() => {
    const loadFile = async () => {
      const db = await getDB();
      const file = await db.getOne<FileRecord>(
        "SELECT * FROM files WHERE id = ?",
        [fileId!],
      );
      if (!file) {
        navigate("/create");
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

      // Auto-detect source language from first segments
      if (!sourceLanguage && rawSegments.length > 0) {
        const sampleText = rawSegments
          .slice(0, 10)
          .map((segment) => segment.source)
          .join(" ");
        const detected = await detectLanguage(sampleText);
        if (detected) {
          setSourceLanguage(detected);
          setUnsupportedSource(false);
          const validTargets = getTargetLanguages(detected);
          if (validTargets.length === 1) {
            setTargetLanguage(validTargets[0].id);
          }
        } else {
          setUnsupportedSource(true);
        }
      }

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

  const handleTranslateSegment = useCallback(
    async (segmentId: string) => {
      const segment = segments.find((s) => s.id === segmentId);
      if (!segment || !sourceLanguage || !targetLanguage) return;

      const controller = new AbortController();
      await translateSegments(
        [{ id: segment.id, source: segment.source }],
        sourceLanguage,
        targetLanguage,
        controller.signal,
        (result) => {
          setSegments((prev) =>
            prev.map((s) =>
              s.id === result.id
                ? { ...s, target: result.translation, origin: "ai" as const }
                : s,
            ),
          );
        },
      );
    },
    [segments, sourceLanguage, targetLanguage, setSegments],
  );

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

    setIsDownloading(true);
    try {
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
    } finally {
      setIsDownloading(false);
    }
  }, [segments, fileName, targetLanguage]);

  useEditorHotkeys({
    segments,
    activeSegmentId,
    isTranslating,
    setZoomPercent,
    onResetView: () => setResetViewKey((k) => k + 1),
    onSegmentClick: handleSegmentClick,
    onDeselect: () => setActiveSegmentId(null),
    onConfirm: handleConfirm,
    onTranslate: handleTranslate,
    onSidebarModeChange: setSidebarMode,
    onToggleInspector: () => setInspectorOpen((open) => !open),
  });

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
      <div className="w-56 shrink-0 border-r border-grey-3 dark:border-grey-14 overflow-hidden flex flex-col">
        <div className="flex items-center px-4 py-2 shrink-0">
          <Link to="/" className="inline-flex items-center justify-center h-8">
            <OfflineIcon className="w-8 bg-black dark:bg-white" />
          </Link>
        </div>
        <div className="flex-1 overflow-hidden">
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
              onSegmentFocus={handleSegmentClick}
              onTargetChange={handleTargetChange}
              onConfirm={handleConfirm}
              onTranslateSegment={handleTranslateSegment}
              canTranslate={!!sourceLanguage && !!targetLanguage}
            />
          )}
        </div>
      </div>

      {/* Right portion - header + content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-grey-3 dark:border-grey-14 pl-4 py-2">
          <div className="flex items-center">
            <div className="flex items-center gap-3 min-w-0">
              {hasCanvas && (
                <SidebarViewToggle
                  mode={sidebarMode}
                  onModeChange={setSidebarMode}
                />
              )}
              <Button
                onPress={() => navigate("/create")}
                className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors"
                aria-label="Back to home"
              >
                <PlusIcon />
              </Button>
              <span className="font-medium text-sm truncate">
                {displayName}
              </span>
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

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              <ComboBox
                aria-label="Source language"
                selectedKey={sourceLanguage}
                isDisabled={unsupportedSource}
                onSelectionChange={(key) => {
                  if (!key) return;
                  const newSource = key as string;
                  setSourceLanguage(newSource);
                  const validTargets = getTargetLanguages(newSource);
                  if (validTargets.length === 1) {
                    setTargetLanguage(validTargets[0].id);
                  } else if (
                    !validTargets.some(
                      (language) => language.id === targetLanguage,
                    )
                  ) {
                    setTargetLanguage("");
                  }
                }}
                menuTrigger="focus"
                defaultItems={getSourceLanguages()}
              >
                <Input
                  placeholder="Source"
                  className="w-30 border border-grey-3 dark:border-ui-divider rounded-lg px-2.5 py-1 text-sm bg-grey-1 dark:bg-grey-23 hover:bg-grey-2 dark:hover:bg-grey-15 outline-none focus:ring-2 focus:ring-primary-6 text-grey-9 dark:text-grey-4"
                />
                <Popover className="bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider rounded-lg shadow-lg py-1 min-w-[160px]">
                  <ListBox className="outline-none max-h-60 overflow-auto">
                    {(item: { id: string; name: string }) => (
                      <ListBoxItem
                        id={item.id}
                        className="px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4 data-[selected]:font-medium data-[focused]:bg-grey-3 dark:data-[focused]:bg-grey-15"
                      >
                        {item.name}
                      </ListBoxItem>
                    )}
                  </ListBox>
                </Popover>
              </ComboBox>
              <span className="text-grey-6">
                <ArrowRightIcon />
              </span>
              <ComboBox
                aria-label="Target language"
                selectedKey={targetLanguage}
                onSelectionChange={(key) => {
                  if (key) setTargetLanguage(key as string);
                }}
                menuTrigger="focus"
                defaultItems={getTargetLanguages(sourceLanguage)}
                isDisabled={!sourceLanguage || unsupportedSource}
              >
                <Input
                  placeholder="Target"
                  className="w-30 border border-grey-3 dark:border-ui-divider rounded-lg px-2.5 py-1 text-sm bg-grey-1 dark:bg-grey-23 hover:bg-grey-2 dark:hover:bg-grey-15 outline-none focus:ring-2 focus:ring-primary-6 text-grey-9 dark:text-grey-4"
                />
                <Popover className="bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider rounded-lg shadow-lg py-1 min-w-[160px]">
                  <ListBox className="outline-none max-h-60 overflow-auto">
                    {(item: { id: string; name: string }) => (
                      <ListBoxItem
                        id={item.id}
                        className="px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4 data-[selected]:font-medium data-[focused]:bg-grey-3 dark:data-[focused]:bg-grey-15"
                      >
                        {item.name}
                      </ListBoxItem>
                    )}
                  </ListBox>
                </Popover>
              </ComboBox>

              <Button
                onPress={handleTranslate}
                isDisabled={isTranslating || !sourceLanguage || !targetLanguage}
                className="p-2 rounded-lg cursor-pointer transition-colors text-grey-7 dark:text-grey-6 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Translate"
              >
                {isTranslating ? <LoadingIcon /> : <TranslateIcon />}
              </Button>

              <Button
                onPress={handleDownload}
                isDisabled={stats.translated === 0 || isDownloading}
                className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Download translated file"
              >
                {isDownloading ? <LoadingIcon /> : <DownloadIcon />}
              </Button>
            </div>
            <div className="w-60 shrink-0" />
          </div>
        </header>

        {/* Errors are logged to console, not shown in the UI */}

        {/* Canvas + Right sidebar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Center - canvas */}
          <div className="flex-1 overflow-auto bg-grey-3 dark:bg-grey-23">
            {segments.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-grey-6">No translatable segments found.</p>
              </div>
            ) : hasCanvas && currentLayout ? (
              <SlideCanvas
                layout={currentLayout}
                segments={segments}
                activeSegmentId={activeSegmentId}
                onSegmentFocus={setActiveSegmentId}
                onTargetChange={handleTargetChange}
                onConfirm={handleConfirm}
                onTranslateSegment={handleTranslateSegment}
                canTranslate={!!sourceLanguage && !!targetLanguage}
                imageUrls={imageUrls}
                zoomPercent={zoomPercent}
                onZoomChange={setZoomPercent}
                resetViewKey={resetViewKey}
              />
            ) : (
              <SegmentListEditor
                segments={segments}
                activeSegmentId={activeSegmentId}
                onSegmentFocus={setActiveSegmentId}
                onTargetChange={handleTargetChange}
                onConfirm={handleConfirm}
                onTranslateSegment={handleTranslateSegment}
                canTranslate={!!sourceLanguage && !!targetLanguage}
              />
            )}
          </div>

          {/* Right sidebar - inspector */}
          {inspectorOpen && (
            <div className="w-60 shrink-0 border-l border-grey-3 dark:border-grey-14 bg-grey-1 dark:bg-ui-app-background">
              <InspectorPanel
                segment={activeSegment}
                onConfirm={handleConfirm}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
