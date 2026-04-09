import { memo } from "react";
import type { Segment } from "../hooks/useTranslation";
import type { SlideLayout } from "../lib/parser-client";

interface SlideThumbnailProps {
  layout: SlideLayout;
  segments: Segment[];
  imageUrls?: Map<string, string>;
  width?: number;
}

export const SlideThumbnail = memo(function SlideThumbnail({
  layout,
  segments,
  imageUrls,
  width = 180,
}: SlideThumbnailProps) {
  const scale = width / layout.width;
  const scaledHeight = layout.height * scale;
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));

  const PT_TO_PX = 4 / 3;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: `${width}px`,
        height: `${scaledHeight}px`,
        backgroundColor: layout.background?.fill?.color ?? "#FFFFFF",
        pointerEvents: "none",
      }}
    >
      {/* Background image */}
      {layout.background?.image &&
        (() => {
          const url = imageUrls?.get(layout.background!.image!.mediaPath);
          return url ? (
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
          ) : null;
        })()}

      {/* Shapes */}
      {layout.shapes
        .filter((shape) => shape.image || shape.y < layout.height)
        .map((shape) => {
          const style: React.CSSProperties = {
            position: "absolute",
            left: `${shape.x * scale}px`,
            top: `${shape.y * scale}px`,
            width: `${shape.width * scale}px`,
            height: `${shape.height * scale}px`,
            zIndex: shape.zIndex,
          };

          if (shape.image) {
            const url = imageUrls?.get(shape.image.mediaPath);
            if (url) {
              return (
                <img
                  key={`shape-${shape.zIndex}-${shape.x}-${shape.y}`}
                  src={url}
                  alt=""
                  style={{ ...style, objectFit: "cover" }}
                />
              );
            }
          }

          if (shape.fill) {
            return (
              <div
                key={`shape-${shape.zIndex}-${shape.x}-${shape.y}`}
                style={{
                  ...style,
                  backgroundColor: shape.fill.color,
                  ...(shape.fill.opacity != null && {
                    opacity: shape.fill.opacity,
                  }),
                }}
              />
            );
          }

          return null;
        })}

      {/* Text regions */}
      {layout.regions.map((region) => {
        const segment = segmentMap.get(region.segmentId);
        if (!segment) return null;

        const text = segment.target ?? segment.source;
        const fontStyle = region.fontStyle;
        const fontSize = fontStyle?.sizePoints
          ? Math.max(4, fontStyle.sizePoints * PT_TO_PX * scale)
          : Math.max(4, 14 * scale);

        return (
          <div
            key={region.segmentId}
            className="absolute overflow-hidden"
            style={{
              left: `${region.x * scale}px`,
              top: `${region.y * scale}px`,
              width: `${region.width * scale}px`,
              height: `${region.height * scale}px`,
              zIndex: region.zIndex,
              fontSize: `${fontSize}px`,
              lineHeight: fontStyle?.lineSpacingPoints
                ? `${fontStyle.lineSpacingPoints * PT_TO_PX * scale}px`
                : `${fontStyle?.lineHeight ?? 1.3}`,
              fontWeight: fontStyle?.bold ? "bold" : undefined,
              fontStyle: fontStyle?.italic ? "italic" : undefined,
              color: fontStyle?.color ?? "#000000",
              textAlign: fontStyle?.align ?? undefined,
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
});
