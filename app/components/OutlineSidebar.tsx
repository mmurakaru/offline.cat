import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { SlashCommand } from "../extensions/slash-command";
import { createSlashCommandSuggestion } from "../extensions/slash-command-renderer";
import type { Segment } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import type { SlideLayout } from "../lib/parser-client";
import type { DocxDocumentLayout } from "../lib/parsers/docx";
import { startDictation } from "../lib/speech-recognition";

interface OutlineSidebarProps {
  segments: Segment[];
  layouts: SlideLayout[];
  docxLayout?: DocxDocumentLayout | null;
  fileType: string;
  activeSegmentId: string | null;
  onSegmentFocus: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
  onTranslateSegment: (segmentId: string) => void;
  canTranslate: boolean;
}

function getStatusColor(segment: Segment): string {
  if (segment.origin === "user") return "bg-green-500";
  if (segment.origin === "translationMemory") return "bg-green-400";
  if (segment.origin === "ai") return "bg-grey-6";
  return "bg-grey-4 dark:bg-ui-divider";
}

function SegmentRow({
  segment,
  isActive,
  onFocus,
  onContentChange,
  onConfirm,
  onTranslateSegment,
  canTranslate,
}: {
  segment: Segment;
  isActive: boolean;
  onFocus: () => void;
  onContentChange: (value: string) => void;
  onConfirm: (value: string) => void;
  onTranslateSegment: () => void;
  canTranslate: boolean;
}) {
  const editorInstanceRef = useRef<ReturnType<typeof useEditor>>(null);
  const callbacksRef = useRef({
    onContentChange,
    onTranslateSegment,
    source: segment.source,
    canTranslate,
  });
  callbacksRef.current = {
    onContentChange,
    onTranslateSegment,
    source: segment.source,
    canTranslate,
  };

  const slashCommandSuggestion = useMemo(
    () =>
      createSlashCommandSuggestion({
        onInsertSource: () => {
          editorInstanceRef.current?.commands.setContent(
            callbacksRef.current.source,
          );
          callbacksRef.current.onContentChange(callbacksRef.current.source);
        },
        onTranslateSegment: () => {
          callbacksRef.current.onTranslateSegment();
        },
        canTranslate: () => callbacksRef.current.canTranslate,
        onStartDictation: () => {
          startDictation(
            (text) => {
              editorInstanceRef.current?.commands.setContent(text);
              callbacksRef.current.onContentChange(text);
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
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: "Click to translate...",
      }),
      SlashCommand.configure({
        suggestion: slashCommandSuggestion,
      }),
    ],
    content: segment.target ?? "",
    editorProps: {
      attributes: {
        class: "outline-none text-xs px-1.5 py-1 min-h-[24px]",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          const text = editor?.getText() ?? "";
          if (text) onConfirm(text);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onContentChange(currentEditor.getText());
    },
    onFocus: () => {
      onFocus();
    },
  });

  editorInstanceRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    const currentText = editor.getText();
    const newText = segment.target ?? "";
    if (currentText !== newText) {
      editor.commands.setContent(newText);
    }
  }, [editor, segment.target]);

  return (
    <div
      className={cn(
        "px-2 py-1.5 rounded transition-colors",
        isActive
          ? "bg-primary-5/15 dark:bg-primary-9/30"
          : "hover:bg-grey-3 dark:hover:bg-grey-23",
      )}
    >
      <button
        type="button"
        onClick={onFocus}
        className="flex items-start gap-2 w-full text-left cursor-pointer"
      >
        <span
          className={cn(
            "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
            getStatusColor(segment),
          )}
        />
        <p className="text-xs text-grey-9 dark:text-grey-4 line-clamp-2">
          {segment.source}
        </p>
      </button>
      <div
        className={cn(
          "mt-1 ml-3.5 rounded border transition-colors",
          isActive
            ? "border-primary-5 dark:border-primary-4"
            : "border-transparent hover:border-grey-4 dark:hover:border-grey-10",
        )}
      >
        <EditorContent editor={editor} className="cursor-text" />
      </div>
    </div>
  );
}

function buildGroups(
  segments: Segment[],
  layouts: SlideLayout[],
  docxLayout: DocxDocumentLayout | null | undefined,
  fileType: string,
): { label: string | null; segments: Segment[] }[] {
  // PPTX: group by slide
  if (fileType === "pptx" && layouts.length > 0) {
    const segmentMap = new Map(
      segments.map((segment) => [segment.id, segment]),
    );
    return layouts.map((layout) => ({
      label: `Slide ${layout.slideIndex + 1}`,
      segments: layout.regions
        .map((region) => segmentMap.get(region.segmentId))
        .filter(Boolean) as Segment[],
    }));
  }

  // DOCX: group by page (split at pageBreak blocks)
  if (fileType === "docx" && docxLayout) {
    const pages: { label: string; segments: Segment[] }[] = [];
    let currentSegments: Segment[] = [];
    let pageIndex = 0;
    const segmentMap = new Map(
      segments.map((segment) => [segment.id, segment]),
    );

    for (const block of docxLayout.blocks) {
      if (block.type === "pageBreak") {
        if (currentSegments.length > 0) {
          pages.push({
            label: `Page ${pageIndex + 1}`,
            segments: currentSegments,
          });
          currentSegments = [];
          pageIndex++;
        }
      } else if (block.type === "paragraph") {
        const segment = segmentMap.get(block.segmentId);
        if (segment) currentSegments.push(segment);
      }
    }
    // Remaining segments after last page break
    if (currentSegments.length > 0) {
      pages.push({ label: `Page ${pageIndex + 1}`, segments: currentSegments });
    }

    // If only one page, don't show the label
    if (pages.length <= 1) {
      return [{ label: null, segments }];
    }
    return pages;
  }

  // HTML, XLIFF, etc: flat list, no grouping
  return [{ label: null, segments }];
}

export function OutlineSidebar({
  segments,
  layouts,
  docxLayout,
  fileType,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  onTranslateSegment,
  canTranslate,
}: OutlineSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const check = () => {
      setIsScrollable(el.scrollHeight > el.clientHeight);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const groups = useMemo(
    () => buildGroups(segments, layouts, docxLayout, fileType),
    [segments, layouts, docxLayout, fileType],
  );

  return (
    <div
      ref={scrollRef}
      className={cn(
        "h-full overflow-y-auto no-scrollbar bg-grey-1 dark:bg-ui-app-background",
        isScrollable && "scroll-fade",
      )}
    >
      <div className="p-2">
        {groups.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex} className="mb-3">
            {group.label && (
              <div className="px-2 py-1 text-xs font-medium text-grey-7 uppercase">
                {group.label}
              </div>
            )}
            {group.segments.map((segment) => (
              <SegmentRow
                key={segment.id}
                segment={segment}
                isActive={activeSegmentId === segment.id}
                onFocus={() => onSegmentFocus(segment.id)}
                onContentChange={(value) => onTargetChange(segment.id, value)}
                onConfirm={(value) => onConfirm(segment.id, value)}
                onTranslateSegment={() => onTranslateSegment(segment.id)}
                canTranslate={canTranslate}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
