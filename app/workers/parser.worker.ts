// Offloads file parsing and reconstruction to a worker thread
// so unzipping, XML parsing, and rezipping don't block the UI.

import {
  extractSegments as extractDocx,
  reconstructDocx,
} from "../lib/parsers/docx";
import {
  extractSegments as extractHtml,
  reconstructHtml,
} from "../lib/parsers/html";
import {
  extractSegments as extractPptx,
  reconstructPptx,
} from "../lib/parsers/pptx";
import {
  extractSegments as extractXliff,
  reconstructXliff,
} from "../lib/parsers/xliff";

export type ParserRequest =
  | { action: "extract"; data: Uint8Array; ext: string }
  | {
      action: "reconstruct";
      data: Uint8Array;
      ext: string;
      translations: [string, string][];
    };

self.addEventListener("message", (event: MessageEvent<ParserRequest>) => {
  const request = event.data;

  if (request.action === "extract") {
    const segments = extractByFormat(request.data, request.ext);
    self.postMessage({ action: "extract", segments });
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
