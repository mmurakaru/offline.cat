import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef } from "react";
import type { Segment } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import type {
  SlideBackground,
  SlideLayout,
  VisualShape,
} from "../lib/parser-client";

interface SlideCanvasProps {
  layout: SlideLayout;
  segments: Segment[];
  activeSegmentId: string | null;
  onSegmentFocus: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
  imageUrls?: Map<string, string>;
}

interface TextBoxEditorProps {
  segment: Segment;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  isActive: boolean;
  zIndex: number;
  fontSizePoints?: number;
  bold?: boolean;
  italic?: boolean;
  fontColor?: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  lineSpacingPoints?: number;
  onFocus: () => void;
  onContentChange: (value: string) => void;
  onConfirm: (value: string) => void;
}

function SlideBackgroundRenderer({
  background,
  imageUrls,
}: {
  background: SlideBackground;
  imageUrls?: Map<string, string>;
}) {
  // Solid fills are handled by the container's backgroundColor.
  // This component only renders image backgrounds.
  if (background.image) {
    const url = imageUrls?.get(background.image.mediaPath);
    if (url) {
      return (
        <img
          src={url}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0,
          }}
        />
      );
    }
  }

  return null;
}

function ShapeRenderer({
  shape,
  scale,
  imageUrls,
}: {
  shape: VisualShape;
  scale: number;
  imageUrls?: Map<string, string>;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${shape.x * scale}px`,
    top: `${shape.y * scale}px`,
    width: `${shape.width * scale}px`,
    height: `${shape.height * scale}px`,
    zIndex: shape.zIndex,
    pointerEvents: "none",
  };

  if (shape.image) {
    const url = imageUrls?.get(shape.image.mediaPath);
    if (url) {
      return <img src={url} alt="" style={{ ...style, objectFit: "cover" }} />;
    }
  }

  if (shape.fill) {
    return (
      <div
        style={{
          ...style,
          backgroundColor: shape.fill.color,
          ...(shape.fill.opacity != null && { opacity: shape.fill.opacity }),
        }}
      />
    );
  }

  return null;
}

function TextBoxEditor({
  segment,
  x,
  y,
  width,
  height,
  scale,
  isActive,
  zIndex,
  fontSizePoints,
  bold,
  italic,
  fontColor,
  textAlign,
  lineHeight,
  lineSpacingPoints,
  onFocus,
  onContentChange,
  onConfirm,
}: TextBoxEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // 1pt = 4/3 px (96dpi), then scale to canvas size
  const PT_TO_PX = 4 / 3;
  const scaledFontSize = fontSizePoints
    ? Math.max(10, fontSizePoints * PT_TO_PX * scale)
    : Math.max(10, 14 * scale);

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
        placeholder: segment.source,
      }),
    ],
    content: segment.target ?? "",
    editorProps: {
      attributes: {
        class: "outline-none h-full",
        style: [
          `font-size: ${scaledFontSize}px`,
          lineSpacingPoints
            ? `line-height: ${lineSpacingPoints * PT_TO_PX * scale}px`
            : `line-height: ${lineHeight ?? 1.3}`,
          bold ? "font-weight: bold" : "",
          italic ? "font-style: italic" : "",
          `color: ${fontColor ?? "#000000"}`,
          textAlign ? `text-align: ${textAlign}` : "",
        ]
          .filter(Boolean)
          .join("; "),
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

  // Sync external content changes (e.g. from MT)
  useEffect(() => {
    if (!editor) return;
    const currentText = editor.getText();
    const newText = segment.target ?? "";
    if (currentText !== newText && !editor.isFocused) {
      editor.commands.setContent(newText);
    }
  }, [editor, segment.target]);

  const isConfirmed = segment.origin === "user";

  return (
    <div
      ref={editorRef}
      className={cn(
        "absolute overflow-hidden transition-shadow rounded-sm",
        isActive
          ? "ring-2 ring-blue-500"
          : isConfirmed
            ? "ring-1 ring-green-400/50"
            : "ring-1 ring-gray-300/40 hover:ring-blue-300",
      )}
      style={{
        left: `${x * scale}px`,
        top: `${y * scale}px`,
        width: `${width * scale}px`,
        minHeight: `${height * scale}px`,
        borderRadius: "2px",
        zIndex: isActive ? 1000 : zIndex,
      }}
    >
      <EditorContent editor={editor} className="h-full p-1 cursor-text" />
      {isConfirmed && !isActive && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border border-white dark:border-gray-900" />
      )}
    </div>
  );
}

export function SlideCanvas({
  layout,
  segments,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  imageUrls,
}: SlideCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));

  const maxWidth = 900;
  const scale = Math.min(maxWidth / layout.width, 1);
  const scaledWidth = layout.width * scale;
  const scaledHeight = layout.height * scale;

  const handleConfirm = useCallback(
    (segmentId: string) => {
      return (value: string) => {
        onConfirm(segmentId, value);
      };
    },
    [onConfirm],
  );

  return (
    <div className="flex items-start justify-center p-4 overflow-auto h-full">
      <div
        ref={containerRef}
        className="relative border border-gray-200 dark:border-gray-700 rounded shadow-lg shrink-0 overflow-hidden"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          backgroundColor: layout.background?.fill?.color ?? "#FFFFFF",
        }}
      >
        {layout.background && (
          <SlideBackgroundRenderer
            background={layout.background}
            imageUrls={imageUrls}
          />
        )}

        {/* TODO: filter out-of-bounds shapes in the parser instead of here */}
        {layout.shapes
          .filter((shape) => shape.image || shape.y < layout.height)
          .map((shape) => (
            <ShapeRenderer
              key={`shape-${shape.zIndex}-${shape.x}-${shape.y}`}
              shape={shape}
              scale={scale}
              imageUrls={imageUrls}
            />
          ))}

        {layout.regions.map((region) => {
          const segment = segmentMap.get(region.segmentId);
          if (!segment) return null;

          return (
            <TextBoxEditor
              key={region.segmentId}
              segment={segment}
              x={region.x}
              y={region.y}
              width={region.width}
              height={region.height}
              scale={scale}
              isActive={activeSegmentId === region.segmentId}
              zIndex={region.zIndex}
              fontSizePoints={region.fontStyle?.sizePoints}
              bold={region.fontStyle?.bold}
              italic={region.fontStyle?.italic}
              fontColor={region.fontStyle?.color}
              textAlign={region.fontStyle?.align}
              lineHeight={region.fontStyle?.lineHeight}
              lineSpacingPoints={region.fontStyle?.lineSpacingPoints}
              onFocus={() => onSegmentFocus(region.segmentId)}
              onContentChange={(value) =>
                onTargetChange(region.segmentId, value)
              }
              onConfirm={handleConfirm(region.segmentId)}
            />
          );
        })}
      </div>
    </div>
  );
}
