import { describe, expect, it } from "vitest";
import { markdownParser } from "./markdown-adapter";

const sampleMarkdown = `---
name: sample-skill
description: A short skill for testing.
---

# Hello world

Second paragraph

- First item
- Second item
`;

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("markdownParser", () => {
  it("has correct extensions", () => {
    expect(markdownParser.extensions).toEqual(["md", "markdown"]);
  });

  describe("parse", () => {
    it("returns markdown editor model", () => {
      const result = markdownParser.parse(toBytes(sampleMarkdown));
      expect(result.editorModel.mode).toBe("markdown");
    });

    it("exposes frontmatter fields and body blocks", () => {
      const result = markdownParser.parse(toBytes(sampleMarkdown));
      if (result.editorModel.mode !== "markdown") throw new Error("wrong mode");

      expect(result.editorModel.frontmatter.map((field) => field.key)).toEqual([
        "name",
        "description",
      ]);
      expect(result.editorModel.blocks.map((block) => block.kind)).toEqual([
        "heading",
        "paragraph",
        "listItem",
        "listItem",
      ]);
    });

    it("extracts segments in document order", () => {
      const result = markdownParser.parse(toBytes(sampleMarkdown));
      expect(result.segments.map((segment) => segment.source)).toEqual([
        "sample-skill",
        "A short skill for testing.",
        "Hello world",
        "Second paragraph",
        "First item",
        "Second item",
      ]);
    });

    it("assigns sequential md-N ids", () => {
      const result = markdownParser.parse(toBytes(sampleMarkdown));
      expect(result.segments[0].id).toBe("md-0");
      expect(result.segments[1].id).toBe("md-1");
    });

    it("returns no images", () => {
      const result = markdownParser.parse(toBytes(sampleMarkdown));
      expect(result.images).toEqual([]);
    });

    it("returns ParsedSegment shape (no extra fields)", () => {
      const result = markdownParser.parse(toBytes(sampleMarkdown));
      for (const segment of result.segments) {
        expect(Object.keys(segment).sort()).toEqual(["id", "source"]);
      }
    });
  });

  describe("reconstruct", () => {
    it("replaces text with translations", () => {
      const translations = new Map([
        ["md-2", "Hallo Welt"],
        ["md-3", "Zweiter Absatz"],
      ]);
      const result = markdownParser.reconstruct(
        toBytes(sampleMarkdown),
        translations,
      );
      const output = new TextDecoder().decode(result);
      expect(output).toContain("# Hallo Welt");
      expect(output).toContain("Zweiter Absatz");
    });

    it("round-trips without translations producing identical output", () => {
      const result = markdownParser.reconstruct(
        toBytes(sampleMarkdown),
        new Map(),
      );
      const output = new TextDecoder().decode(result);
      expect(output).toBe(sampleMarkdown);
    });
  });
});
