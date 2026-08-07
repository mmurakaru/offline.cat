import { describe, expect, it } from "vitest";
import {
  extractSegments,
  parseMarkdown,
  reconstructMarkdown,
} from "./markdown";

const skill = `---
name: pdf-processor
description: Extract text and tables from PDF files.
license: MIT
---

# PDF Processor

A skill for working with **PDF documents** entirely on-device.

## Capabilities

- Extract text and tables
- Fill and flatten forms

See the [documentation](https://example.com/docs) for details.
`;

describe("extractSegments", () => {
  it("extracts headings and paragraphs without block markers", () => {
    const segments = extractSegments("# Title\n\nBody text");

    expect(segments).toHaveLength(2);
    expect(segments[0].source).toBe("Title");
    expect(segments[1].source).toBe("Body text");
  });

  it("keeps inline markup inside the segment", () => {
    const segments = extractSegments("A paragraph with **bold** text.");

    expect(segments[0].source).toBe("A paragraph with **bold** text.");
  });

  it("extracts each list item as its own segment", () => {
    const segments = extractSegments("- First\n- Second");

    expect(segments.map((segment) => segment.source)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("assigns sequential md-N ids in document order", () => {
    const segments = extractSegments("# One\n\nTwo\n\nThree");

    expect(segments[0].id).toBe("md-0");
    expect(segments[1].id).toBe("md-1");
    expect(segments[2].id).toBe("md-2");
  });

  it("returns empty array for markdown with no text", () => {
    expect(extractSegments("---\n\n---\n")).toEqual([]);
  });
});

describe("parseMarkdown", () => {
  it("splits frontmatter fields from body blocks", () => {
    const document = parseMarkdown(skill);

    expect(document.frontmatter.map((field) => field.key)).toEqual([
      "name",
      "description",
      "license",
    ]);
    expect(document.frontmatter[1].source).toBe(
      "Extract text and tables from PDF files.",
    );
  });

  it("records block kinds and heading levels", () => {
    const document = parseMarkdown(skill);

    expect(document.blocks[0]).toMatchObject({ kind: "heading", level: 1 });
    expect(document.blocks[1]).toMatchObject({ kind: "paragraph" });
    expect(document.blocks[2]).toMatchObject({ kind: "heading", level: 2 });
    expect(document.blocks[3]).toMatchObject({ kind: "listItem" });
  });

  it("shares one id space across frontmatter and body", () => {
    const document = parseMarkdown(skill);
    const ids = [
      ...document.frontmatter.map((field) => field.id),
      ...document.blocks.map((block) => block.id),
    ];

    expect(ids).toEqual(ids.map((_, index) => `md-${index}`));
  });
});

describe("reconstructMarkdown", () => {
  it("replaces segment text with translations", () => {
    const translations = new Map([
      ["md-3", "Procesador de PDF"],
      ["md-4", "Una skill para trabajar con **documentos PDF**."],
    ]);

    const result = reconstructMarkdown(skill, translations);

    expect(result).toContain("# Procesador de PDF");
    expect(result).toContain("Una skill para trabajar con **documentos PDF**.");
    expect(result).not.toContain("PDF Processor");
  });

  it("translates frontmatter values while preserving keys", () => {
    const translations = new Map([
      ["md-1", "Extrae texto y tablas de archivos PDF."],
    ]);

    const result = reconstructMarkdown(skill, translations);

    expect(result).toContain(
      "description: Extrae texto y tablas de archivos PDF.",
    );
  });

  it("round-trips without translations producing identical output", () => {
    expect(reconstructMarkdown(skill, new Map())).toBe(skill);
  });

  it("leaves untranslated segments unchanged", () => {
    const result = reconstructMarkdown(skill, new Map([["md-3", "Titulo"]]));

    expect(result).toContain("# Titulo");
    expect(result).toContain("## Capabilities");
  });
});
