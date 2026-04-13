// The contract every format parser implements.
// This interface works for both JS parsers and future Rust WASM parsers.

import type { EditorModel } from "./editor-model";

export interface ParsedSegment {
  id: string;
  source: string;
  target?: string;
}

export interface ParsedImage {
  mediaPath: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface ParseResult {
  segments: ParsedSegment[];
  editorModel: EditorModel;
  images: ParsedImage[];
}

export interface FormatParser {
  extensions: string[];
  parse(data: Uint8Array): ParseResult;
  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array;
}
