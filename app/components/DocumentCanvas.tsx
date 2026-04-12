import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { DocxPageBreak } from "../extensions/docx-page-break";
import { DocxParagraph } from "../extensions/docx-paragraph";
import { DocxReadOnlyBlock } from "../extensions/docx-read-only-block";
import { SlashCommand } from "../extensions/slash-command";
import { createSlashCommandSuggestion } from "../extensions/slash-command-renderer";
import type { Segment } from "../hooks/useTranslation";
import type { DocxDocumentLayout } from "../lib/parsers/docx";
import { startDictation } from "../lib/speech-recognition";

interface DocumentCanvasProps {
  layout: DocxDocumentLayout;
  segments: Segment[];
  activeSegmentId: string | null;
  onSegmentFocus: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
  onTranslateSegment: (segmentId: string) => void;
  canTranslate: boolean;
  imageUrls?: Map<string, string>;
  zoomPercent: number | "fit";
  onZoomChange: (zoom: number | "fit") => void;
  resetViewKey?: number;
}

const PT_TO_PX = 4 / 3;

const ZOOM_LEVELS = [
  "fit",
  "25",
  "50",
  "75",
  "100",
  "125",
  "150",
  "200",
] as const;

function buildDocxTiptapContent(
  layout: DocxDocumentLayout,
  segmentMap: Map<string, Segment>,
  imageUrls?: Map<string, string>,
): JSONContent {
  const content: JSONContent[] = [];

  for (const block of layout.blocks) {
    if (block.type === "pageBreak") {
      content.push({ type: "docxPageBreak" });
    } else if (block.type === "table") {
      content.push({
        type: "docxReadOnlyBlock",
        attrs: { blockType: "table" },
      });
    } else if (block.type === "image") {
      const imageSrc = block.mediaPath
        ? (imageUrls?.get(block.mediaPath) ?? null)
        : null;
      content.push({
        type: "docxReadOnlyBlock",
        attrs: { blockType: "image", imageSrc },
      });
    } else if (block.type === "paragraph") {
      const segment = segmentMap.get(block.segmentId);
      const text = segment?.target || block.text;

      content.push({
        type: "paragraph",
        attrs: {
          segmentId: block.segmentId,
          alignment: block.paragraphStyle.alignment ?? null,
          fontSize: block.dominantRunStyle.sizePoints ?? null,
          bold: block.dominantRunStyle.bold ?? false,
          italic: block.dominantRunStyle.italic ?? false,
          color: block.dominantRunStyle.color ?? null,
          fontFamily: block.dominantRunStyle.fontFamily ?? null,
          spacingBefore: block.paragraphStyle.spacingBeforePt ?? null,
          spacingAfter: block.paragraphStyle.spacingAfterPt ?? null,
          indentLeft: block.paragraphStyle.indentLeftPt ?? null,
        },
        content: text ? [{ type: "text", text }] : undefined,
      });
    }
  }

  return { type: "doc", content };
}

export function DocumentCanvas({
  layout,
  segments,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  onTranslateSegment,
  canTranslate,
  imageUrls,
  zoomPercent,
  onZoomChange,
  resetViewKey,
}: DocumentCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isExternalUpdate = useRef(false);
  const editorInstanceRef = useRef<ReturnType<typeof useEditor>>(null);

  const segmentMap = useMemo(
    () => new Map(segments.map((segment) => [segment.id, segment])),
    [segments],
  );

  const callbacksRef = useRef({
    onTargetChange,
    onSegmentFocus,
    onTranslateSegment,
    canTranslate,
    segmentMap,
  });
  callbacksRef.current = {
    onTargetChange,
    onSegmentFocus,
    onTranslateSegment,
    canTranslate,
    segmentMap,
  };

  const initialContent = useMemo(
    () => buildDocxTiptapContent(layout, segmentMap, imageUrls),
    // Only compute on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, segmentMap, imageUrls],
  );

  const slashCommandSuggestion = useMemo(
    () =>
      createSlashCommandSuggestion({
        onInsertSource: () => {
          const currentEditor = editorInstanceRef.current;
          if (!currentEditor) return;
          const segmentId = getActiveSegmentId(currentEditor);
          if (!segmentId) return;
          const segment = callbacksRef.current.segmentMap.get(segmentId);
          if (!segment) return;
          // Replace current paragraph text with source
          const { from, to } = getSegmentNodeRange(currentEditor, segmentId);
          if (from !== -1) {
            currentEditor
              .chain()
              .focus()
              .insertContentAt({ from, to }, segment.source)
              .run();
            callbacksRef.current.onTargetChange(segmentId, segment.source);
          }
        },
        onTranslateSegment: () => {
          const currentEditor = editorInstanceRef.current;
          if (!currentEditor) return;
          const segmentId = getActiveSegmentId(currentEditor);
          if (segmentId) {
            callbacksRef.current.onTranslateSegment(segmentId);
          }
        },
        canTranslate: () => callbacksRef.current.canTranslate,
        onStartDictation: () => {
          const currentEditor = editorInstanceRef.current;
          if (!currentEditor) return;
          const segmentId = getActiveSegmentId(currentEditor);
          if (!segmentId) return;
          startDictation(
            (text) => {
              const { from, to } = getSegmentNodeRange(
                currentEditor,
                segmentId,
              );
              if (from !== -1) {
                currentEditor
                  .chain()
                  .focus()
                  .insertContentAt({ from, to }, text)
                  .run();
                callbacksRef.current.onTargetChange(segmentId, text);
              }
            },
            () => {},
          );
        },
      }),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      DocxParagraph,
      DocxPageBreak,
      DocxReadOnlyBlock,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name !== "paragraph") return "";
          const segmentId = node.attrs.segmentId;
          const segment = callbacksRef.current.segmentMap.get(segmentId);
          return segment?.source ?? "Click to translate...";
        },
      }),
      SlashCommand.configure({
        suggestion: slashCommandSuggestion,
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          const currentEditor = editorInstanceRef.current;
          if (!currentEditor) return false;
          const segmentId = getActiveSegmentId(currentEditor);
          if (!segmentId) return false;
          const text = getSegmentText(currentEditor, segmentId);
          if (text) {
            onConfirm(segmentId, text);
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (isExternalUpdate.current) return;

      // Walk paragraphs to find which changed
      currentEditor.state.doc.forEach((node, _offset) => {
        if (node.type.name !== "paragraph") return;
        const segmentId = node.attrs.segmentId as string;
        if (!segmentId) return;
        const text = node.textContent;
        const segment = callbacksRef.current.segmentMap.get(segmentId);
        if (segment && text !== (segment.target ?? "")) {
          callbacksRef.current.onTargetChange(segmentId, text);
        }
      });
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const segmentId = getActiveSegmentId(currentEditor);
      if (segmentId) {
        callbacksRef.current.onSegmentFocus(segmentId);
      }
    },
  });

  editorInstanceRef.current = editor;

  // Sync external segment changes (MT, TM) into the editor
  useEffect(() => {
    if (!editor) return;

    isExternalUpdate.current = true;
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name !== "paragraph") return;
      const segmentId = node.attrs.segmentId as string;
      if (!segmentId) return;
      const segment = segmentMap.get(segmentId);
      if (!segment) return;
      const currentText = node.textContent;
      const targetText = segment.target ?? "";
      if (currentText !== targetText && targetText) {
        // +1 to skip past the node opening, nodeSize-2 to cover content range
        const from = offset + 1;
        const to = offset + node.nodeSize - 1;
        editor
          .chain()
          .insertContentAt({ from, to }, targetText, {
            updateSelection: false,
          })
          .run();
      }
    });
    isExternalUpdate.current = false;
  }, [editor, segmentMap]);

  // Zoom and pan
  const pageWidthPx = layout.pageDimensions.widthPt * PT_TO_PX;
  const pageHeightPx = layout.pageDimensions.heightPt * PT_TO_PX;

  const fitScale = wrapperRef.current
    ? Math.min((wrapperRef.current.clientWidth - 64) / pageWidthPx, 1)
    : Math.min(900 / pageWidthPx, 1);

  const scale = zoomPercent === "fit" ? fitScale : zoomPercent / 100;
  const displayPercent = Math.round(scale * 100);

  useEffect(() => {
    if (zoomPercent === "fit") setPan({ x: 0, y: 0 });
  }, [zoomPercent]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetViewKey is an intentional trigger
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [resetViewKey]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        const current =
          zoomPercent === "fit" ? Math.round(fitScale * 100) : zoomPercent;
        const delta = -event.deltaY * 0.5;
        onZoomChange(Math.round(Math.min(400, Math.max(10, current + delta))));
      } else {
        setPan((prev) => ({
          x: prev.x - event.deltaX,
          y: prev.y - event.deltaY,
        }));
      }
    };

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, [fitScale, zoomPercent, onZoomChange]);

  // Active segment highlighting via CSS class
  const activeSegmentStyle = activeSegmentId
    ? `[data-segment-id="${activeSegmentId}"] { outline: 2px solid var(--color-primary-5); outline-offset: 1px; border-radius: 2px; }`
    : "";

  // Confirmed segments
  const confirmedStyles = segments
    .filter((segment) => segment.origin === "user")
    .map(
      (segment) =>
        `[data-segment-id="${segment.id}"] { outline: 1px solid oklch(0.75 0.14 148 / 0.5); outline-offset: 1px; border-radius: 2px; }`,
    )
    .join("\n");

  return (
    <div className="relative h-full">
      <style>
        {activeSegmentStyle}
        {"\n"}
        {confirmedStyles}
      </style>
      <div ref={wrapperRef} className="overflow-auto h-full">
        <div
          className="flex justify-center py-8"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <div
            className="border border-grey-3 dark:border-ui-divider shadow-lg shrink-0"
            style={{
              width: `${pageWidthPx * scale}px`,
              minHeight: `${pageHeightPx * scale}px`,
              paddingTop: `${layout.pageDimensions.marginTopPt * PT_TO_PX * scale}px`,
              paddingBottom: `${layout.pageDimensions.marginBottomPt * PT_TO_PX * scale}px`,
              paddingLeft: `${layout.pageDimensions.marginLeftPt * PT_TO_PX * scale}px`,
              paddingRight: `${layout.pageDimensions.marginRightPt * PT_TO_PX * scale}px`,
              transformOrigin: "top center",
              fontSize: `${14 * scale}px`,
              backgroundColor: "#FFFFFF",
              color: "#000000",
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-10">
        <MenuTrigger>
          <Button className="flex items-center gap-1 px-2 py-1 text-xs tabular-nums rounded bg-grey-1/80 dark:bg-grey-23/80 backdrop-blur border border-grey-3 dark:border-ui-divider text-grey-8 dark:text-grey-6 cursor-pointer outline-none hover:bg-grey-1 dark:hover:bg-grey-23">
            {zoomPercent === "fit" ? "Fit Page" : `${displayPercent}%`}
          </Button>
          <Popover className="bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider rounded-lg shadow-lg py-1 min-w-[100px]">
            <Menu
              onAction={(key) => {
                const value = key as string;
                if (value === "fit") {
                  onZoomChange("fit");
                  setPan({ x: 0, y: 0 });
                } else {
                  onZoomChange(Number(value));
                }
              }}
              className="outline-none"
            >
              {ZOOM_LEVELS.map((level) => (
                <MenuItem
                  key={level}
                  id={level}
                  className="px-3 py-1.5 text-xs cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4 data-[focused]:bg-grey-3 dark:data-[focused]:bg-grey-15"
                >
                  {level === "fit" ? "Fit Page" : `${level}%`}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
    </div>
  );
}

// Helpers to find segment info from the editor state

function getActiveSegmentId(
  editor: ReturnType<typeof useEditor>,
): string | null {
  if (!editor) return null;
  const { $from } = editor.state.selection;
  // Walk up from selection to find the paragraph node
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "paragraph") {
      return (node.attrs.segmentId as string) ?? null;
    }
  }
  return null;
}

function getSegmentText(
  editor: ReturnType<typeof useEditor>,
  segmentId: string,
): string {
  if (!editor) return "";
  let text = "";
  editor.state.doc.forEach((node) => {
    if (node.type.name === "paragraph" && node.attrs.segmentId === segmentId) {
      text = node.textContent;
    }
  });
  return text;
}

function getSegmentNodeRange(
  editor: ReturnType<typeof useEditor>,
  segmentId: string,
): { from: number; to: number } {
  if (!editor) return { from: -1, to: -1 };
  let result = { from: -1, to: -1 };
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === "paragraph" && node.attrs.segmentId === segmentId) {
      result = { from: offset + 1, to: offset + node.nodeSize - 1 };
    }
  });
  return result;
}
