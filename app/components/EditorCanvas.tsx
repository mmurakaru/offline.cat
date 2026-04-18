import type { Segment } from "../hooks/useTranslation";
import type { EditorModel } from "../lib/ice/editor-model";
import { DocumentCanvas } from "./DocumentCanvas";
import { HtmlCanvas } from "./HtmlCanvas";
import { SegmentListEditor } from "./SegmentListEditor";
import { SlideCanvas } from "./SlideCanvas";

export interface CanvasProps {
  segments: Segment[];
  activeSegmentId: string | null;
  onSegmentFocus: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
  onTranslateSegment: (segmentId: string) => void;
  canTranslate: boolean;
  zoomPercent: number | "fit";
  onZoomChange: (zoom: number | "fit") => void;
  resetViewKey: number;
}

interface EditorCanvasProps extends CanvasProps {
  model: EditorModel;
  imageUrls: Map<string, string>;
  activeSlideIndex: number;
}

export function EditorCanvas({
  model,
  imageUrls,
  activeSlideIndex,
  segments,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  onTranslateSegment,
  canTranslate,
  zoomPercent,
  onZoomChange,
  resetViewKey,
}: EditorCanvasProps) {
  const sharedProps = {
    segments,
    activeSegmentId,
    onSegmentFocus,
    onTargetChange,
    onConfirm,
    onTranslateSegment,
    canTranslate,
  };

  switch (model.mode) {
    case "slide": {
      const currentLayout = model.slides[activeSlideIndex];
      if (!currentLayout) return null;
      return (
        <SlideCanvas
          layout={{
            slideIndex: currentLayout.index,
            width: currentLayout.width,
            height: currentLayout.height,
            regions: currentLayout.regions.map((region) => ({
              segmentId: region.segmentId,
              x: region.x,
              y: region.y,
              width: region.width,
              height: region.height,
              fontStyle: region.fontStyle
                ? {
                    sizePoints: region.fontStyle.sizePt,
                    bold: region.fontStyle.bold,
                    italic: region.fontStyle.italic,
                    color: region.fontStyle.color,
                    align: region.fontStyle.align as
                      | "left"
                      | "center"
                      | "right"
                      | undefined,
                    lineHeight: region.fontStyle.lineHeight,
                    lineSpacingPoints: region.fontStyle.lineSpacingPt,
                  }
                : undefined,
              zIndex: region.zIndex,
            })),
            shapes: currentLayout.shapes.map((shape) => ({
              x: shape.x,
              y: shape.y,
              width: shape.width,
              height: shape.height,
              fill: shape.fill
                ? {
                    type: "solid" as const,
                    color: shape.fill.color,
                    opacity: shape.fill.opacity,
                  }
                : undefined,
              image: shape.image
                ? {
                    mediaPath: shape.image.mediaPath,
                    contentType: shape.image.contentType,
                  }
                : undefined,
              zIndex: shape.zIndex,
              source: shape.source,
            })),
            background: currentLayout.background
              ? {
                  fill: currentLayout.background.fill
                    ? {
                        type: "solid" as const,
                        color: currentLayout.background.fill.color,
                        opacity: currentLayout.background.fill.opacity,
                      }
                    : undefined,
                  image: currentLayout.background.image
                    ? {
                        mediaPath: currentLayout.background.image.mediaPath,
                        contentType: currentLayout.background.image.contentType,
                      }
                    : undefined,
                }
              : undefined,
            defaultTextColor: currentLayout.defaultTextColor,
          }}
          imageUrls={imageUrls}
          zoomPercent={zoomPercent}
          onZoomChange={onZoomChange}
          resetViewKey={resetViewKey}
          {...sharedProps}
        />
      );
    }
    case "page":
      return (
        <DocumentCanvas
          layout={{
            pageDimensions: model.pageDimensions,
            blocks: model.blocks.map((block) => {
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
              if (block.type === "table") {
                return { type: "table" as const };
              }
              return { type: "pageBreak" as const };
            }),
          }}
          imageUrls={imageUrls}
          zoomPercent={zoomPercent}
          onZoomChange={onZoomChange}
          resetViewKey={resetViewKey}
          {...sharedProps}
        />
      );
    case "html-preview":
      return <HtmlCanvas rawHtml={model.rawHtml} {...sharedProps} />;
    case "segment-list":
      return <SegmentListEditor {...sharedProps} />;
  }
}
