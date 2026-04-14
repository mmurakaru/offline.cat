import { useCallback, useMemo, useRef, useState } from "react";
import {
  Button,
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";
import { useTranslation as useI18n } from "react-i18next";
import {
  isRouteErrorResponse,
  Link,
  useNavigate,
  useParams,
} from "react-router";
import { ArrowRightIcon } from "../components/arrow-right-icon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DownloadIcon } from "../components/download-icon";
import { EditorCanvas } from "../components/EditorCanvas";
import { ErrorIcon } from "../components/error-icon";
import { InspectorPanel } from "../components/InspectorPanel";
import { InspectorToggleIcon } from "../components/inspector-toggle-icon";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { LoadingIcon } from "../components/loading-icon";
import { NavigatorSidebar } from "../components/NavigatorSidebar";
import { OutlineSidebar } from "../components/OutlineSidebar";
import { OfflineIcon } from "../components/offline-icon";
import { PlusIcon } from "../components/plus-icon";
import {
  type SidebarMode,
  SidebarViewToggle,
} from "../components/SidebarViewToggle";
import { MyToastRegion, queue } from "../components/ToastRegion";
import { TranslateIcon } from "../components/translate-icon";
import { useEditorHotkeys } from "../hooks/useEditorHotkeys";
import { useFileParsing } from "../hooks/useFileParsing";
import type { Segment } from "../hooks/useTranslation";
import { useTranslation } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import i18n from "../lib/i18n";
import { localePath } from "../lib/localePath";
import { reconstructFile } from "../lib/parser-client";
import { addTranslationMemoryEntry } from "../lib/translation-memory";
import { translateSegments } from "../lib/translator";

export function meta() {
  return [
    { title: i18n.t("meta.editorTitle") },
    {
      name: "description",
      content: i18n.t("meta.editorDescription"),
    },
  ];
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

function LeftSidebarCollapsedNav({
  fileType,
  activeIndex,
  count,
  onClickIndex,
}: {
  fileType: string;
  activeIndex: number;
  count: number;
  onClickIndex: (index: number) => void;
}) {
  const { t } = useI18n();
  if (count <= 0) return null;

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar scroll-fade">
      <div className="flex flex-col items-center gap-1 px-1 pt-1">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onClickIndex(index)}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold leading-none cursor-pointer transition-colors shrink-0",
              index === activeIndex
                ? "bg-primary-5 text-white"
                : "text-grey-6 hover:text-grey-8 dark:hover:text-grey-4 hover:bg-grey-3 dark:hover:bg-grey-15",
            )}
            title={t(fileType === "pptx" ? "outline.slide" : "outline.page", {
              num: index + 1,
            })}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function InspectorCollapsedIcons({ segment }: { segment: Segment | null }) {
  if (!segment) return null;

  const label =
    segment.origin === "translationMemory"
      ? "TM"
      : segment.origin === "ai"
        ? "AI"
        : segment.origin === "user"
          ? "\u2713"
          : null;

  const colorClass =
    segment.origin === "user"
      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
      : segment.origin === "translationMemory"
        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
        : segment.origin === "ai"
          ? "bg-grey-3 text-grey-8 dark:bg-grey-15 dark:text-grey-6"
          : "";

  if (!label) return null;

  return (
    <div className="flex flex-col items-center gap-1.5 pt-1">
      <span
        className={cn(
          "w-6 h-6 flex items-center justify-center rounded text-[9px] font-bold leading-none",
          colorClass,
        )}
      >
        {label}
      </span>
    </div>
  );
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
  const { t } = useI18n();
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [targetLanguage, setTargetLanguage] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("outline");
  const [isDownloading, setIsDownloading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [zoomPercent, setZoomPercent] = useState<number | "fit">("fit");
  const [resetViewKey, setResetViewKey] = useState(0);
  const { segments, setSegments, isTranslating, translate } = useTranslation();

  const onNavigateAway = useCallback(
    () => navigate(localePath("/create")),
    [navigate],
  );
  const {
    fileName,
    fileType,
    editorModel,
    imageUrls,
    sourceLanguage,
    setSourceLanguage,
    unsupportedSource,
    fileData,
  } = useFileParsing({
    fileId,
    sourceLanguage: "",
    targetLanguage,
    onNavigateAway,
    setSegments,
  });

  // Auto-set sidebar mode when editor model changes
  const prevEditorModeRef = useRef<string | null>(null);
  if (editorModel && editorModel.mode !== prevEditorModeRef.current) {
    prevEditorModeRef.current = editorModel.mode;
    if (editorModel.mode === "slide" && sidebarMode !== "navigator") {
      setSidebarMode("navigator");
    }
  }

  const fileDataRef = useRef<{ data: Uint8Array; ext: string } | null>(null);
  if (fileData) fileDataRef.current = fileData;

  const handleTranslate = useCallback(async () => {
    await translate(segments, sourceLanguage, targetLanguage);
    queue.add({ title: t("editor.translationComplete") }, { timeout: 5000 });
  }, [segments, sourceLanguage, targetLanguage, translate, t]);

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
      // Find which slide this segment belongs to (slide mode only)
      if (editorModel?.mode === "slide") {
        for (const slide of editorModel.slides) {
          const found = slide.regions.some(
            (region) => region.segmentId === segmentId,
          );
          if (found) {
            setActiveSlide(
              editorModel.slides.findIndex((s) => s.index === slide.index),
            );
            break;
          }
        }
      }
    },
    [editorModel],
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
      if (editorModel?.mode === "slide") {
        const slide = editorModel.slides[slideIndex];
        if (slide?.regions.length > 0) {
          setActiveSegmentId(slide.regions[0].segmentId);
        }
      }
    },
    [editorModel],
  );

  // Count pages/slides for the collapsed left sidebar nav
  const collapsedNavCount = useMemo(() => {
    if (!editorModel) return 0;
    if (editorModel.mode === "slide") return editorModel.slides.length;
    if (editorModel.mode === "page") {
      let count = 1;
      for (const block of editorModel.blocks) {
        if (block.type === "pageBreak") count++;
      }
      return count;
    }
    return 0;
  }, [editorModel]);

  // Compat bridges for sidebar components that still use old types (Phase 5 removes these)
  const slideLayoutsCompat = useMemo(() => {
    if (editorModel?.mode !== "slide") return [];
    return editorModel.slides.map((slide) => ({
      slideIndex: slide.index,
      width: slide.width,
      height: slide.height,
      regions: slide.regions.map((r) => ({
        segmentId: r.segmentId,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        fontStyle: r.fontStyle
          ? {
              sizePoints: r.fontStyle.sizePt,
              bold: r.fontStyle.bold,
              italic: r.fontStyle.italic,
              color: r.fontStyle.color,
              align: r.fontStyle.align as
                | "left"
                | "center"
                | "right"
                | undefined,
              lineHeight: r.fontStyle.lineHeight,
              lineSpacingPoints: r.fontStyle.lineSpacingPt,
            }
          : undefined,
        zIndex: r.zIndex,
      })),
      shapes: slide.shapes.map((s) => ({
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        fill: s.fill
          ? {
              type: "solid" as const,
              color: s.fill.color,
              opacity: s.fill.opacity,
            }
          : undefined,
        image: s.image
          ? { mediaPath: s.image.mediaPath, contentType: s.image.contentType }
          : undefined,
        zIndex: s.zIndex,
        source: s.source,
      })),
      background: slide.background
        ? {
            fill: slide.background.fill
              ? {
                  type: "solid" as const,
                  color: slide.background.fill.color,
                  opacity: slide.background.fill.opacity,
                }
              : undefined,
            image: slide.background.image
              ? {
                  mediaPath: slide.background.image.mediaPath,
                  contentType: slide.background.image.contentType,
                }
              : undefined,
          }
        : undefined,
      defaultTextColor: slide.defaultTextColor,
    }));
  }, [editorModel]);

  const docxLayoutCompat = useMemo(() => {
    if (editorModel?.mode !== "page") return null;
    return {
      pageDimensions: editorModel.pageDimensions,
      blocks: editorModel.blocks.map((block) => {
        if (block.type === "paragraph") {
          return {
            type: "paragraph" as const,
            segmentId: block.segmentId,
            text: block.text,
            paragraphStyle: {
              alignment: block.style.alignment,
              spacingBeforePt: block.style.spacingBeforePt,
              spacingAfterPt: block.style.spacingAfterPt,
              indentLeftPt: block.style.indentLeftPt,
              indentFirstLinePt: block.style.indentFirstLinePt,
            },
            dominantRunStyle: {
              bold: block.runStyle.bold,
              italic: block.runStyle.italic,
              underline: block.runStyle.underline,
              sizePoints: block.runStyle.sizePt,
              color: block.runStyle.color,
              fontFamily: block.runStyle.fontFamily,
            },
          };
        }
        if (block.type === "image") {
          return {
            type: "image" as const,
            mediaPath: block.mediaPath,
            contentType: block.contentType,
          };
        }
        if (block.type === "table") return { type: "table" as const };
        return { type: "pageBreak" as const };
      }),
    };
  }, [editorModel]);

  const fileTypeBadge = getFileTypeBadge(fileName);
  const displayName = fileType
    ? fileName.replace(new RegExp(`\\.${fileType}$`, "i"), "")
    : fileName;

  return (
    <div className="h-screen flex">
      {/* Left sidebar - collapses in preview mode */}
      <div
        className="left-sidebar shrink-0 border-r border-grey-3 dark:border-grey-14 flex flex-col"
        {...(sidebarMode === "preview" && { "data-collapsed": "" })}
      >
        <div className="py-2 px-1 shrink-0">
          <Link
            to={localePath("/")}
            className="inline-flex items-center justify-center h-9 w-9 shrink-0"
          >
            <OfflineIcon className="w-9 bg-black dark:bg-white" />
          </Link>
        </div>
        {sidebarMode === "preview" ? (
          <LeftSidebarCollapsedNav
            fileType={fileType}
            activeIndex={activeSlide}
            count={collapsedNavCount}
            onClickIndex={handleSlideClick}
          />
        ) : (
          <div className="flex-1 overflow-hidden">
            {sidebarMode === "navigator" && editorModel?.mode === "slide" ? (
              <NavigatorSidebar
                layouts={slideLayoutsCompat}
                segments={segments}
                activeSlide={activeSlide}
                imageUrls={imageUrls}
                onSlideClick={handleSlideClick}
              />
            ) : (
              <OutlineSidebar
                segments={segments}
                layouts={slideLayoutsCompat}
                docxLayout={docxLayoutCompat}
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
        )}
      </div>

      {/* Right portion - header + content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-grey-3 dark:border-grey-14 pl-4 py-2">
          <div className="flex items-center">
            <div className="flex items-center gap-3 min-w-0">
              {fileType !== "xliff" && fileType !== "xlf" && (
                <SidebarViewToggle
                  mode={sidebarMode}
                  onModeChange={setSidebarMode}
                  fileType={fileType}
                />
              )}
              {stats.translated > 0 ? (
                <ConfirmDialog
                  title={t("editor.discardTitle")}
                  description={t("editor.discardDescription")}
                  confirmLabel={t("editor.discardConfirm")}
                  onConfirm={() => navigate(localePath("/create"))}
                >
                  <Button
                    className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors"
                    aria-label={t("editor.newFile")}
                  >
                    <PlusIcon />
                  </Button>
                </ConfirmDialog>
              ) : (
                <Button
                  onPress={() => navigate(localePath("/create"))}
                  className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors"
                  aria-label={t("editor.newFile")}
                >
                  <PlusIcon />
                </Button>
              )}
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
                aria-label={t("editor.sourceLanguage")}
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
                  placeholder={t("editor.sourcePlaceholder")}
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
                aria-label={t("editor.targetLanguage")}
                selectedKey={targetLanguage}
                onSelectionChange={(key) => {
                  if (key) setTargetLanguage(key as string);
                }}
                menuTrigger="focus"
                defaultItems={getTargetLanguages(sourceLanguage)}
                isDisabled={!sourceLanguage || unsupportedSource}
              >
                <Input
                  placeholder={t("editor.targetPlaceholder")}
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
                aria-label={t("editor.translate")}
              >
                {isTranslating ? <LoadingIcon /> : <TranslateIcon />}
              </Button>

              <Button
                onPress={handleDownload}
                isDisabled={stats.translated === 0 || isDownloading}
                className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t("editor.download")}
              >
                {isDownloading ? <LoadingIcon /> : <DownloadIcon />}
              </Button>
            </div>
            <div
              className="inspector-spacer shrink-0"
              {...(!inspectorOpen && { "data-collapsed": "" })}
            />
          </div>
        </header>

        {/* Errors are logged to console, not shown in the UI */}

        {/* Canvas + Right sidebar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Center - canvas */}
          <div className="flex-1 overflow-auto bg-grey-3 dark:bg-grey-23">
            {segments.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-grey-6">{t("editor.noSegments")}</p>
              </div>
            ) : editorModel ? (
              <EditorCanvas
                model={editorModel}
                imageUrls={imageUrls}
                activeSlideIndex={activeSlide}
                segments={segments}
                activeSegmentId={activeSegmentId}
                onSegmentFocus={setActiveSegmentId}
                onTargetChange={handleTargetChange}
                onConfirm={handleConfirm}
                onTranslateSegment={handleTranslateSegment}
                canTranslate={!!sourceLanguage && !!targetLanguage}
                zoomPercent={zoomPercent}
                onZoomChange={setZoomPercent}
                resetViewKey={resetViewKey}
              />
            ) : null}
          </div>

          {/* Right sidebar - inspector */}
          <div
            className="inspector-sidebar shrink-0 border-l border-grey-3 dark:border-grey-14 bg-grey-1 dark:bg-ui-app-background flex flex-col"
            {...(!inspectorOpen && { "data-collapsed": "" })}
          >
            <div className="flex justify-end px-2.5 py-2 shrink-0">
              <button
                type="button"
                onClick={() => setInspectorOpen((open) => !open)}
                className="p-1 rounded-md hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors"
                aria-label={t("editor.toggleInspector")}
              >
                <InspectorToggleIcon />
              </button>
            </div>
            {inspectorOpen ? (
              <div className="flex-1 overflow-hidden min-w-60">
                <InspectorPanel
                  segment={activeSegment}
                  onConfirm={handleConfirm}
                />
              </div>
            ) : (
              <InspectorCollapsedIcons segment={activeSegment} />
            )}
            <div className={cn("mt-auto pb-2", inspectorOpen ? "flex justify-end px-2.5" : "flex flex-col items-center")}>
              <LocaleSwitcher className={inspectorOpen ? undefined : "flex-col"} />
            </div>
          </div>
        </div>
      </div>
      <MyToastRegion />
    </div>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const { t } = useI18n();
  let message = t("error.fileLoadMessage");

  if (isRouteErrorResponse(error)) {
    message = error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-grey-1 dark:bg-ui-app-background">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <ErrorIcon className="w-8 h-8 text-grey-6" />
        <h1 className="text-lg font-semibold text-grey-9 dark:text-grey-4">
          {t("error.fileLoad")}
        </h1>
        <p className="text-sm text-grey-7 dark:text-grey-6">{message}</p>
        <Link
          to={localePath("/create")}
          className="mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-5 text-white hover:bg-primary-6 transition-colors"
        >
          {t("error.uploadNew")}
        </Link>
      </div>
    </div>
  );
}
