// Thin async wrapper around parser.worker.ts.
// Keeps the main thread free during file parsing and reconstruction.

import type { ParserRequest } from "../workers/parser.worker";
import type { EditorModel } from "./ice/editor-model";
import type { ParsedSegment } from "./ice/parser-interface";

let worker: Worker | null = null;

// Lazily creates a single shared worker instance.
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL("../workers/parser.worker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return worker;
}

// Sends a request to the worker and resolves with the matching response.
function postMessage<T extends { action: string }>(
  request: ParserRequest,
): Promise<T> {
  return new Promise((resolve) => {
    const parserWorker = getWorker();
    const handler = (event: MessageEvent) => {
      if (event.data?.action !== request.action) return;
      parserWorker.removeEventListener("message", handler);
      resolve(event.data);
    };
    parserWorker.addEventListener("message", handler);
    parserWorker.postMessage(request);
  });
}

export interface ParseFileResult {
  segments: ParsedSegment[];
  editorModel: EditorModel;
  imageUrls: Map<string, string>;
}

// Parses a file completely: segments + editor model + image blob URLs.
export async function parseFile(
  data: Uint8Array,
  ext: string,
): Promise<ParseFileResult> {
  const response = await postMessage<{
    action: "parse";
    result?: {
      segments: ParsedSegment[];
      editorModel: EditorModel;
      images: { mediaPath: string; bytes: Uint8Array; contentType: string }[];
    };
    error?: string;
  }>({ action: "parse", data, ext });

  if (response.error || !response.result) {
    throw new Error(response.error ?? "Parse failed: no result from worker");
  }

  const imageUrls = new Map<string, string>();
  for (const image of response.result.images ?? []) {
    const bytes =
      image.bytes instanceof ArrayBuffer
        ? new Uint8Array(image.bytes)
        : image.bytes;
    const blob = new Blob([bytes as BlobPart], { type: image.contentType });
    imageUrls.set(image.mediaPath, URL.createObjectURL(blob));
  }

  return {
    segments: response.result.segments,
    editorModel: response.result.editorModel,
    imageUrls,
  };
}

// Reconstructs a translated file off the main thread.
export async function reconstructFile(
  data: Uint8Array,
  ext: string,
  translations: Map<string, string>,
): Promise<Uint8Array> {
  const response = await postMessage<{
    action: "reconstruct";
    result: Uint8Array;
  }>({
    action: "reconstruct",
    data,
    ext,
    translations: [...translations.entries()],
  });
  // The worker transfers an ArrayBuffer; wrap it as a standard Uint8Array.
  const buffer =
    response.result instanceof ArrayBuffer
      ? response.result
      : (response.result as Uint8Array).buffer;
  return new Uint8Array(buffer as ArrayBuffer);
}

export function revokeImageUrls(imageUrls: Map<string, string>): void {
  for (const url of imageUrls.values()) {
    URL.revokeObjectURL(url);
  }
}

// ---- Backward-compatible type re-exports ----
// Components (SlideCanvas, NavigatorSidebar, etc.) still import these types.
// They will be removed when those components are updated to use editor-model types.

export type {
  DocxBlock,
  DocxDocumentLayout,
  DocxPageDimensions,
  DocxParagraphLayout,
} from "./parsers/docx";

export type {
  FontStyle,
  ImageReference,
  ShapeFill,
  SlideBackground,
  VisualShape,
} from "./parsers/pptx";

export interface SlideLayout {
  slideIndex: number;
  width: number;
  height: number;
  regions: {
    segmentId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontStyle?: import("./parsers/pptx").FontStyle;
    zIndex: number;
  }[];
  shapes: import("./parsers/pptx").VisualShape[];
  background?: import("./parsers/pptx").SlideBackground;
  defaultTextColor?: string;
}
