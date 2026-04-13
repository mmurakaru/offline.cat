import type { FormatParser } from "../parser-interface";
import { docxParser } from "./docx-adapter";
import { htmlParser } from "./html-adapter";
import { pptxParser } from "./pptx-adapter";
import { xliffParser } from "./xliff-adapter";

const parsers: FormatParser[] = [
  xliffParser,
  htmlParser,
  docxParser,
  pptxParser,
];

export function getParser(ext: string): FormatParser | undefined {
  const lower = ext.toLowerCase();
  return parsers.find((parser) => parser.extensions.includes(lower));
}
