import type { FormatParser, ParseResult } from "../parser-interface";
import {
  extractSegments,
  reconstructHtml,
} from "../../parsers/html";

export const htmlParser: FormatParser = {
  extensions: ["html", "htm"],

  parse(data: Uint8Array): ParseResult {
    const text = new TextDecoder().decode(data);
    const raw = extractSegments(text);
    return {
      segments: raw.map((segment) => ({
        id: segment.id,
        source: segment.source,
      })),
      editorModel: { mode: "html-preview", rawHtml: text },
      images: [],
    };
  },

  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array {
    const text = new TextDecoder().decode(data);
    return new TextEncoder().encode(reconstructHtml(text, translations));
  },
};
