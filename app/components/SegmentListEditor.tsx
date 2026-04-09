import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import type { Segment } from "../hooks/useTranslation";
import { cn } from "../lib/cn";

interface SegmentEditorRowProps {
  segment: Segment;
  isActive: boolean;
  onFocus: () => void;
  onContentChange: (value: string) => void;
  onConfirm: (value: string) => void;
}

function SegmentEditorRow({
  segment,
  isActive,
  onFocus,
  onContentChange,
  onConfirm,
}: SegmentEditorRowProps) {
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
    ],
    content: segment.target ?? "",
    editorProps: {
      attributes: {
        class: "outline-none text-sm px-2 py-1.5 min-h-[32px]",
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

  useEffect(() => {
    if (!editor) return;
    const currentText = editor.getText();
    const newText = segment.target ?? "";
    if (currentText !== newText && !editor.isFocused) {
      editor.commands.setContent(newText);
    }
  }, [editor, segment.target]);

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_1fr] gap-4 px-4 py-2 border-b dark:border-gray-800 transition-colors",
        isActive && "bg-blue-50/50 dark:bg-blue-950/20",
      )}
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 py-1.5">
        {segment.source}
      </p>
      <div
        className={cn(
          "rounded border transition-colors",
          isActive
            ? "border-blue-500 dark:border-blue-400"
            : "border-transparent hover:border-gray-300 dark:hover:border-gray-600",
        )}
      >
        <EditorContent editor={editor} className="cursor-text" />
      </div>
    </div>
  );
}

interface SegmentListEditorProps {
  segments: Segment[];
  activeSegmentId: string | null;
  onSegmentFocus: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
}

export function SegmentListEditor({
  segments,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
}: SegmentListEditorProps) {
  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="border rounded-lg dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="grid grid-cols-[1fr_1fr] gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase border-b dark:border-gray-800">
          <span>Source</span>
          <span>Translation</span>
        </div>
        {segments.map((segment) => (
          <SegmentEditorRow
            key={segment.id}
            segment={segment}
            isActive={activeSegmentId === segment.id}
            onFocus={() => onSegmentFocus(segment.id)}
            onContentChange={(value) => onTargetChange(segment.id, value)}
            onConfirm={(value) => onConfirm(segment.id, value)}
          />
        ))}
      </div>
    </div>
  );
}
