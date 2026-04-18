import { describe, expect, it } from "vitest";
import { htmlParser } from "./html-adapter";

const sampleHtml = `<html>
<head><title>Test</title></head>
<body>
  <h1>Hello world</h1>
  <p>Second paragraph</p>
  <script>var x = 1;</script>
  <p>Third paragraph</p>
</body>
</html>`;

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("htmlParser", () => {
  it("has correct extensions", () => {
    expect(htmlParser.extensions).toEqual(["html", "htm"]);
  });

  describe("parse", () => {
    it("returns html-preview editor model", () => {
      const result = htmlParser.parse(toBytes(sampleHtml));
      expect(result.editorModel.mode).toBe("html-preview");
    });

    it("includes raw HTML in editor model", () => {
      const result = htmlParser.parse(toBytes(sampleHtml));
      if (result.editorModel.mode !== "html-preview")
        throw new Error("wrong mode");
      expect(result.editorModel.rawHtml).toBe(sampleHtml);
    });

    it("extracts text segments from HTML", () => {
      const result = htmlParser.parse(toBytes(sampleHtml));
      expect(result.segments.length).toBe(4);
      expect(result.segments[0].source).toBe("Test");
      expect(result.segments[1].source).toBe("Hello world");
      expect(result.segments[2].source).toBe("Second paragraph");
      expect(result.segments[3].source).toBe("Third paragraph");
    });

    it("assigns sequential html-N ids", () => {
      const result = htmlParser.parse(toBytes(sampleHtml));
      expect(result.segments[0].id).toBe("html-0");
      expect(result.segments[1].id).toBe("html-1");
      expect(result.segments[2].id).toBe("html-2");
    });

    it("returns no images", () => {
      const result = htmlParser.parse(toBytes(sampleHtml));
      expect(result.images).toEqual([]);
    });

    it("returns ParsedSegment shape (no extra fields)", () => {
      const result = htmlParser.parse(toBytes(sampleHtml));
      for (const segment of result.segments) {
        expect(Object.keys(segment).sort()).toEqual(["id", "source"]);
      }
    });
  });

  describe("reconstruct", () => {
    it("replaces text with translations", () => {
      const translations = new Map([
        ["html-1", "Hallo Welt"],
        ["html-2", "Zweiter Absatz"],
      ]);
      const result = htmlParser.reconstruct(toBytes(sampleHtml), translations);
      const output = new TextDecoder().decode(result);
      expect(output).toContain("Hallo Welt");
      expect(output).toContain("Zweiter Absatz");
    });

    it("round-trips without translations producing identical output", () => {
      const result = htmlParser.reconstruct(toBytes(sampleHtml), new Map());
      const output = new TextDecoder().decode(result);
      expect(output).toBe(sampleHtml);
    });
  });
});
