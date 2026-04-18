import { unzipSync } from "fflate";
import {
  extractPptxLayoutFromFiles,
  extractSegmentsFromFiles,
  extractSlideImages,
  reconstructPptx,
} from "../../parsers/pptx";
import type {
  FontStyle,
  ImageRef,
  Shape,
  Slide,
  SlideBackground,
  SolidFill,
  TextRegion,
} from "../editor-model";
import type { FormatParser, ParseResult } from "../parser-interface";

function mapFill(
  raw: import("../../parsers/pptx").ShapeFill | undefined,
): SolidFill | undefined {
  if (!raw) return undefined;
  return { color: raw.color, opacity: raw.opacity };
}

function mapImageRef(
  raw: import("../../parsers/pptx").ImageReference | undefined,
): ImageRef | undefined {
  if (!raw) return undefined;
  return { mediaPath: raw.mediaPath, contentType: raw.contentType };
}

function mapBackground(
  raw: import("../../parsers/pptx").SlideBackground | undefined,
): SlideBackground | undefined {
  if (!raw) return undefined;
  return { fill: mapFill(raw.fill), image: mapImageRef(raw.image) };
}

function mapFontStyle(
  raw: import("../../parsers/pptx").FontStyle | undefined,
): FontStyle | undefined {
  if (!raw) return undefined;
  return {
    sizePt: raw.sizePoints,
    bold: raw.bold,
    italic: raw.italic,
    color: raw.color,
    align: raw.align,
    lineHeight: raw.lineHeight,
    lineSpacingPt: raw.lineSpacingPoints,
  };
}

function mapRegion(raw: import("../../parsers/pptx").TextRegion): TextRegion {
  return {
    segmentId: raw.segmentId,
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
    fontStyle: mapFontStyle(raw.fontStyle),
    zIndex: raw.zIndex,
  };
}

function mapShape(raw: import("../../parsers/pptx").VisualShape): Shape {
  return {
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
    fill: mapFill(raw.fill),
    image: mapImageRef(raw.image),
    zIndex: raw.zIndex,
    source: raw.source,
  };
}

function mapSlide(raw: import("../../parsers/pptx").SlideLayout): Slide {
  return {
    index: raw.slideIndex,
    width: raw.width,
    height: raw.height,
    regions: raw.regions.map(mapRegion),
    shapes: raw.shapes.map(mapShape),
    background: mapBackground(raw.background),
    defaultTextColor: raw.defaultTextColor,
  };
}

export const pptxParser: FormatParser = {
  extensions: ["pptx"],

  parse(data: Uint8Array): ParseResult {
    const files = unzipSync(data);

    const segments = extractSegmentsFromFiles(files).map((segment) => ({
      id: segment.id,
      source: segment.source,
    }));

    const { layouts, mediaPaths } = extractPptxLayoutFromFiles(files);
    const images = extractSlideImages(files, mediaPaths);

    return {
      segments,
      editorModel: {
        mode: "slide",
        slides: layouts.map(mapSlide),
      },
      images: images.map((image) => ({
        mediaPath: image.mediaPath,
        bytes: image.bytes,
        contentType: image.contentType,
      })),
    };
  },

  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array {
    return reconstructPptx(data, translations);
  },
};
