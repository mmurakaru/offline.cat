import { unzipSync } from "fflate";
import {
  extractDocxImages,
  extractDocxLayoutFromFiles,
  extractSegmentsFromFiles,
  reconstructDocx,
} from "../../parsers/docx";
import type { DocumentBlock, PageDimensions } from "../editor-model";
import type { FormatParser, ParseResult } from "../parser-interface";

function mapPageDimensions(
  raw: import("../../parsers/docx").DocxPageDimensions,
): PageDimensions {
  return {
    widthPt: raw.widthPt,
    heightPt: raw.heightPt,
    marginTopPt: raw.marginTopPt,
    marginBottomPt: raw.marginBottomPt,
    marginLeftPt: raw.marginLeftPt,
    marginRightPt: raw.marginRightPt,
  };
}

function mapBlocks(
  raw: import("../../parsers/docx").DocxBlock[],
): DocumentBlock[] {
  return raw.map((block) => {
    if (block.type === "paragraph") {
      return {
        type: "paragraph" as const,
        segmentId: block.segmentId,
        text: block.text,
        style: {
          alignment: block.paragraphStyle.alignment,
          spacingBeforePt: block.paragraphStyle.spacingBeforePt,
          spacingAfterPt: block.paragraphStyle.spacingAfterPt,
          indentLeftPt: block.paragraphStyle.indentLeftPt,
          indentFirstLinePt: block.paragraphStyle.indentFirstLinePt,
        },
        runStyle: {
          bold: block.dominantRunStyle.bold,
          italic: block.dominantRunStyle.italic,
          underline: block.dominantRunStyle.underline,
          sizePt: block.dominantRunStyle.sizePoints,
          color: block.dominantRunStyle.color,
          fontFamily: block.dominantRunStyle.fontFamily,
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
  });
}

export const docxParser: FormatParser = {
  extensions: ["docx"],

  parse(data: Uint8Array): ParseResult {
    const files = unzipSync(data);

    const segments = extractSegmentsFromFiles(files).map((segment) => ({
      id: segment.id,
      source: segment.source,
    }));

    const { layout, mediaPaths } = extractDocxLayoutFromFiles(files);
    const images = extractDocxImages(files, mediaPaths);

    return {
      segments,
      editorModel: {
        mode: "page",
        pageDimensions: mapPageDimensions(layout.pageDimensions),
        blocks: mapBlocks(layout.blocks),
      },
      images: images.map((image) => ({
        mediaPath: image.mediaPath,
        bytes: image.bytes,
        contentType: image.contentType,
      })),
    };
  },

  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array {
    return reconstructDocx(data, translations);
  },
};
