// Thin async wrapper around parser.worker.ts.
// Keeps the main thread free during file parsing and reconstruction.

import type {
  FontStyle,
  ShapeFill,
  ImageReference,
  SlideBackground,
  VisualShape,
} from "./parsers/pptx";
import type { ParserRequest } from "../workers/parser.worker";

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

// Extracts translatable segments from a file off the main thread.
export async function extractSegments(
  data: Uint8Array,
  ext: string,
): Promise<{ id: string; source: string }[]> {
  const response = await postMessage<{
    action: "extract";
    segments: { id: string; source: string }[];
  }>({ action: "extract", data, ext });
  return response.segments;
}

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
    fontStyle?: FontStyle;
    zIndex: number;
  }[];
  shapes: VisualShape[];
  background?: SlideBackground;
}

export type { FontStyle, ShapeFill, ImageReference, SlideBackground, VisualShape };

export async function extractLayout(
  data: Uint8Array,
  ext: string,
): Promise<SlideLayout[]> {
  const response = await postMessage<{
    action: "extractLayout";
    layouts: SlideLayout[];
  }>({ action: "extractLayout", data, ext });
  return response.layouts ?? [];
}

export interface VisualLayoutResult {
  layouts: SlideLayout[];
  imageUrls: Map<string, string>;
}

export async function extractVisualLayout(
  data: Uint8Array,
  ext: string,
): Promise<VisualLayoutResult> {
  const response = await postMessage<{
    action: "extractVisualLayout";
    layouts: SlideLayout[];
    images: { mediaPath: string; bytes: Uint8Array; contentType: string }[];
  }>({ action: "extractVisualLayout", data, ext });

  const imageUrls = new Map<string, string>();
  for (const image of response.images ?? []) {
    const bytes =
      image.bytes instanceof ArrayBuffer
        ? new Uint8Array(image.bytes)
        : image.bytes;
    const blob = new Blob([bytes], { type: image.contentType });
    imageUrls.set(image.mediaPath, URL.createObjectURL(blob));
  }

  return { layouts: response.layouts ?? [], imageUrls };
}

export function revokeImageUrls(imageUrls: Map<string, string>): void {
  for (const url of imageUrls.values()) {
    URL.revokeObjectURL(url);
  }
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
