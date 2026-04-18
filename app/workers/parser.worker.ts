// Offloads file parsing and reconstruction to a worker thread
// so unzipping, XML parsing, and rezipping don't block the UI.

import { getParser } from "../lib/ice/adapters/registry";

export type ParserRequest =
  | { action: "parse"; data: Uint8Array; ext: string }
  | {
      action: "reconstruct";
      data: Uint8Array;
      ext: string;
      translations: [string, string][];
    };

self.addEventListener("message", (event: MessageEvent<ParserRequest>) => {
  const request = event.data;
  const data =
    request.data instanceof Uint8Array
      ? request.data
      : new Uint8Array(request.data as ArrayBuffer);

  const parser = getParser(request.ext);
  if (!parser) {
    self.postMessage({
      action: request.action,
      error: `Unsupported format: ${request.ext}`,
    });
    return;
  }

  if (request.action === "parse") {
    try {
      const result = parser.parse(data);
      const transferBuffers = result.images.map(
        (image) => image.bytes.buffer as ArrayBuffer,
      );
      self.postMessage(
        { action: "parse", result },
        { transfer: transferBuffers },
      );
    } catch (error) {
      console.error("parse error:", error);
      self.postMessage({ action: "parse", error: String(error) });
    }
    return;
  }

  if (request.action === "reconstruct") {
    try {
      const translations = new Map(request.translations);
      const output = parser.reconstruct(data, translations);
      self.postMessage(
        { action: "reconstruct", result: output },
        { transfer: [output.buffer as ArrayBuffer] },
      );
    } catch (error) {
      console.error("reconstruct error:", error);
      self.postMessage({ action: "reconstruct", error: String(error) });
    }
  }
});
