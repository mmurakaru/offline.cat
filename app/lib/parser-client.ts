// Thin async wrapper around parser.worker.ts.
// Keeps the main thread free during file parsing and reconstruction.

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

// Sends a request to the worker and resolves with the response.
function postMessage<T>(request: ParserRequest): Promise<T> {
  return new Promise((resolve) => {
    const parserWorker = getWorker();
    const handler = (event: MessageEvent) => {
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
