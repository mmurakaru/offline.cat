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
        "grid grid-cols-[1fr_1fr] gap-4 px-4 py-2 transition-colors",
        isActive && "bg-primary-5/10 dark:bg-primary-10/20",
      )}
    >
      <p className="text-sm text-grey-8 dark:text-grey-6 py-1.5">
        {segment.source}
      </p>
      <div
        className={cn(
          "rounded border transition-colors",
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
      <div className="border border-grey-3 rounded-lg dark:border-grey-14 bg-grey-1 dark:bg-ui-app-background">
        <div className="grid grid-cols-[1fr_1fr] gap-4 px-4 py-2 text-xs font-medium text-grey-7 uppercase border-b border-grey-3 dark:border-grey-14">
          <span>Source</span>
          <span>Translation</span>
        </div>
        <div className="divide-y divide-grey-3 dark:divide-grey-14">
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
    </div>
  );
}
