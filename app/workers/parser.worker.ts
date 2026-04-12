// Offloads file parsing and reconstruction to a worker thread
// so unzipping, XML parsing, and rezipping don't block the UI.

import { unzipSync } from "fflate";
import {
  extractSegments as extractDocx,
  extractDocxImages,
  extractDocxLayout,
  reconstructDocx,
} from "../lib/parsers/docx";
import {
  extractSegments as extractHtml,
  reconstructHtml,
} from "../lib/parsers/html";
import {
  extractSegments as extractPptx,
  extractPptxLayout,
  extractSlideImages,
  reconstructPptx,
} from "../lib/parsers/pptx";
import {
  extractSegments as extractXliff,
  reconstructXliff,
} from "../lib/parsers/xliff";

export type ParserRequest =
  | { action: "extract"; data: Uint8Array; ext: string }
  | { action: "extractLayout"; data: Uint8Array; ext: string }
  | { action: "extractVisualLayout"; data: Uint8Array; ext: string }
  | { action: "extractDocxLayout"; data: Uint8Array; ext: string }
  | {
      action: "reconstruct";
      data: Uint8Array;
      ext: string;
      translations: [string, string][];
    };

self.addEventListener("message", (event: MessageEvent<ParserRequest>) => {
  const request = event.data;

  if (request.action === "extract") {
    const data =
      request.data instanceof Uint8Array
        ? request.data
        : new Uint8Array(request.data as ArrayBuffer);
    const segments = extractByFormat(data, request.ext);
    self.postMessage({ action: "extract", segments });
    return;
  }

  if (request.action === "extractLayout") {
    try {
      const data =
        request.data instanceof Uint8Array
          ? request.data
          : new Uint8Array(request.data as ArrayBuffer);
      const result =
        request.ext === "pptx"
          ? extractPptxLayout(data)
          : { layouts: [], mediaPaths: [] };
      self.postMessage({ action: "extractLayout", layouts: result.layouts });
    } catch (error) {
      console.error("extractLayout error:", error);
      self.postMessage({ action: "extractLayout", layouts: [] });
    }
    return;
  }

  if (request.action === "extractVisualLayout") {
    try {
      const data =
        request.data instanceof Uint8Array
          ? request.data
          : new Uint8Array(request.data as ArrayBuffer);

      if (request.ext !== "pptx") {
        self.postMessage({
          action: "extractVisualLayout",
          layouts: [],
          images: [],
        });
        return;
      }

      const { layouts, mediaPaths } = extractPptxLayout(data);
      const files = unzipSync(data);
      const images = extractSlideImages(files, mediaPaths);

      const transferBuffers: ArrayBuffer[] = images.map(
        (img) => img.bytes.buffer as ArrayBuffer,
      );

      self.postMessage(
        {
          action: "extractVisualLayout",
          layouts,
          images: images.map((img) => ({
            mediaPath: img.mediaPath,
            bytes: img.bytes,
            contentType: img.contentType,
          })),
        },
        { transfer: transferBuffers },
      );
    } catch (error) {
      console.error("extractVisualLayout error:", error);
      self.postMessage({
        action: "extractVisualLayout",
        layouts: [],
        images: [],
      });
    }
    return;
  }

  if (request.action === "extractDocxLayout") {
    try {
      const data =
        request.data instanceof Uint8Array
          ? request.data
          : new Uint8Array(request.data as ArrayBuffer);
      const { layout, mediaPaths } = extractDocxLayout(data);

      // Extract images and transfer buffers
      const files = unzipSync(data);
      const images = extractDocxImages(files, mediaPaths);
      const transferBuffers: ArrayBuffer[] = images.map(
        (img) => img.bytes.buffer as ArrayBuffer,
      );

      self.postMessage(
        {
          action: "extractDocxLayout",
          layout,
          images: images.map((img) => ({
            mediaPath: img.mediaPath,
            bytes: img.bytes,
            contentType: img.contentType,
          })),
        },
        { transfer: transferBuffers },
      );
    } catch (error) {
      console.error("extractDocxLayout error:", error);
      self.postMessage({
        action: "extractDocxLayout",
        layout: null,
        images: [],
      });
    }
    return;
  }

  if (request.action === "reconstruct") {
    const translations = new Map(request.translations);
    const result = reconstructByFormat(request.data, request.ext, translations);
    self.postMessage(
      { action: "reconstruct", result },
      { transfer: [result.buffer as ArrayBuffer] },
    );
  }
});

// Routes extraction to the correct parser based on file extension.
function extractByFormat(
  data: Uint8Array,
  ext: string,
): { id: string; source: string }[] {
  if (ext === "pptx") return extractPptx(data);
  if (ext === "docx") return extractDocx(data);
  if (ext === "html" || ext === "htm") {
    return extractHtml(new TextDecoder().decode(data));
  }
  if (ext === "xliff" || ext === "xlf") {
    return extractXliff(new TextDecoder().decode(data));
  }
  return [];
}

// Routes reconstruction to the correct parser, returns file bytes.
function reconstructByFormat(
  data: Uint8Array,
  ext: string,
  translations: Map<string, string>,
): Uint8Array {
  if (ext === "pptx") return reconstructPptx(data, translations);
  if (ext === "docx") return reconstructDocx(data, translations);

  // Text-based formats need encoding to Uint8Array for transfer.
  if (ext === "html" || ext === "htm") {
    const html = new TextDecoder().decode(data);
    return new TextEncoder().encode(reconstructHtml(html, translations));
  }
  if (ext === "xliff" || ext === "xlf") {
    const xliff = new TextDecoder().decode(data);
    return new TextEncoder().encode(reconstructXliff(xliff, translations));
  }

  return data;
}
