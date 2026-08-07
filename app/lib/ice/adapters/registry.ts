import type { FormatParser } from "../parser-interface";
import { docxParser } from "./docx-adapter";
import { markdownParser } from "./markdown-adapter";
import { pptxParser } from "./pptx-adapter";
import { xliffParser } from "./xliff-adapter";

const parsers: FormatParser[] = [
  xliffParser,
  markdownParser,
  docxParser,
  pptxParser,
];

export function getParser(ext: string): FormatParser | undefined {
  const lower = ext.toLowerCase();
  return parsers.find((parser) => parser.extensions.includes(lower));
}
