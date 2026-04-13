import type { FormatParser, ParseResult } from "../parser-interface";
import {
  extractSegments,
  reconstructXliff,
} from "../../parsers/xliff";

export const xliffParser: FormatParser = {
  extensions: ["xliff", "xlf"],

  parse(data: Uint8Array): ParseResult {
    const text = new TextDecoder().decode(data);
    const raw = extractSegments(text);
    return {
      segments: raw.map((segment) => ({
        id: segment.id,
        source: segment.source,
        target: segment.target,
      })),
      editorModel: { mode: "segment-list" },
      images: [],
    };
  },

  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array {
    const text = new TextDecoder().decode(data);
    return new TextEncoder().encode(reconstructXliff(text, translations));
  },
};
