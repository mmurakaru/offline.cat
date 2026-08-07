import { parseMarkdown, reconstructMarkdown } from "../../parsers/markdown";
import type { FormatParser, ParseResult } from "../parser-interface";

export const markdownParser: FormatParser = {
  extensions: ["md", "markdown"],

  parse(data: Uint8Array): ParseResult {
    const text = new TextDecoder().decode(data);
    const document = parseMarkdown(text);

    const frontmatter = document.frontmatter.map((field) => ({
      id: field.id,
      key: field.key,
    }));
    const blocks = document.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      level: block.level,
    }));

    const segments = [
      ...document.frontmatter.map((field) => ({
        id: field.id,
        source: field.source,
      })),
      ...document.blocks.map((block) => ({
        id: block.id,
        source: block.source,
      })),
    ];

    return {
      segments,
      editorModel: { mode: "markdown", frontmatter, blocks },
      images: [],
    };
  },

  reconstruct(data: Uint8Array, translations: Map<string, string>): Uint8Array {
    const text = new TextDecoder().decode(data);
    return new TextEncoder().encode(reconstructMarkdown(text, translations));
  },
};
