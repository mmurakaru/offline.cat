import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef } from "react";
import { SlashCommand } from "../extensions/slash-command";
import { createSlashCommandSuggestion } from "../extensions/slash-command-renderer";
import type { Segment } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import type { SlideLayout } from "../lib/parser-client";
import { startDictation } from "../lib/speech-recognition";

interface OutlineSidebarProps {
  segments: Segment[];
  layouts: SlideLayout[];
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
  const callbacksRef = useRef({ onContentChange, onTranslateSegment, source: segment.source, canTranslate });
  callbacksRef.current = { onContentChange, onTranslateSegment, source: segment.source, canTranslate };

  const slashCommandSuggestion = useMemo(
    () =>
      createSlashCommandSuggestion({
        onInsertSource: () => {
          editorInstanceRef.current?.commands.setContent(callbacksRef.current.source);
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

export function OutlineSidebar({
  segments,
  layouts,
  fileType,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  onTranslateSegment,
  canTranslate,
}: OutlineSidebarProps) {
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));

  // Group segments by slide
  const slideGroups = layouts.map((layout) => ({
    slideIndex: layout.slideIndex,
    segments: layout.regions
      .map((region) => segmentMap.get(region.segmentId))
      .filter(Boolean) as Segment[],
  }));

  // Fallback: if no layouts, show all segments as one group
  const groups =
    slideGroups.length > 0 ? slideGroups : [{ slideIndex: 0, segments }];

  const groupLabel = fileType === "pptx" ? "Slide" : "Page";

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-grey-1 dark:bg-ui-app-background scroll-fade">
      <div className="p-2">
        {groups.map((group) => (
          <div key={group.slideIndex} className="mb-3">
            {groups.length > 1 && (
              <div className="px-2 py-1 text-xs font-medium text-grey-7 uppercase">
                {groupLabel} {group.slideIndex + 1}
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
