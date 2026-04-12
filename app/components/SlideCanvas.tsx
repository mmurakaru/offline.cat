import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
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
  zoomPercent: number | "fit";
  onZoomChange: (zoom: number | "fit") => void;
  resetViewKey?: number;
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
          ? "ring-2 ring-primary-5"
          : isConfirmed
            ? "ring-1 ring-green-400/50"
            : "ring-1 ring-grey-4/40 hover:ring-primary-3",
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
    </div>
  );
}

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

export function SlideCanvas({
  layout,
  segments,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  imageUrls,
  zoomPercent,
  onZoomChange,
  resetViewKey,
}: SlideCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const fitScale = wrapperRef.current
    ? Math.min(
        (wrapperRef.current.clientWidth - 32) / layout.width,
        (wrapperRef.current.clientHeight - 32) / layout.height,
        1,
      )
    : Math.min(900 / layout.width, 1);

  const scale = zoomPercent === "fit" ? fitScale : zoomPercent / 100;
  const displayPercent = Math.round(scale * 100);
  const scaledWidth = layout.width * scale;
  const scaledHeight = layout.height * scale;

  // Reset pan when switching to fit
  useEffect(() => {
    if (zoomPercent === "fit") setPan({ x: 0, y: 0 });
  }, [zoomPercent]);

  // Reset pan when externally triggered (e.g. Cmd+0)
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
        // Pinch-to-zoom
        const current =
          zoomPercent === "fit" ? Math.round(fitScale * 100) : zoomPercent;
        const delta = -event.deltaY * 0.5;
        onZoomChange(Math.round(Math.min(400, Math.max(10, current + delta))));
      } else {
        // Two-finger pan
        setPan((prev) => ({
          x: prev.x - event.deltaX,
          y: prev.y - event.deltaY,
        }));
      }
    };

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, [fitScale, zoomPercent, onZoomChange]);

  const handleConfirm = useCallback(
    (segmentId: string) => {
      return (value: string) => {
        onConfirm(segmentId, value);
      };
    },
    [onConfirm],
  );

  return (
    <div className="relative h-full">
      <div ref={wrapperRef} className="overflow-hidden h-full">
        <div
          className="flex items-center justify-center h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <div
            ref={containerRef}
            className="relative border border-grey-3 dark:border-ui-divider rounded shadow-lg shrink-0 overflow-hidden"
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
      </div>

      <div className="absolute bottom-3 left-3 z-10">
        <MenuTrigger>
          <Button className="flex items-center gap-1 px-2 py-1 text-xs tabular-nums rounded bg-grey-1/80 dark:bg-grey-23/80 backdrop-blur border border-grey-3 dark:border-ui-divider text-grey-8 dark:text-grey-6 cursor-pointer outline-none hover:bg-grey-1 dark:hover:bg-grey-23">
            {zoomPercent === "fit" ? "Fit Slide" : `${displayPercent}%`}
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
                  {level === "fit" ? "Fit Slide" : `${level}%`}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
    </div>
  );
}
