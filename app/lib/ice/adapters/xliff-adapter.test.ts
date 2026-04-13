import { describe, expect, it } from "vitest";
import { xliffParser } from "./xliff-adapter";

const sampleXliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="de">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Hallo</target>
      </trans-unit>
      <trans-unit id="2">
        <source>World</source>
      </trans-unit>
      <trans-unit id="3">
        <source>Goodbye</source>
        <target>Tschüss</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("xliffParser", () => {
  it("has correct extensions", () => {
    expect(xliffParser.extensions).toEqual(["xliff", "xlf"]);
  });

  describe("parse", () => {
    it("returns segment-list editor model", () => {
      const result = xliffParser.parse(toBytes(sampleXliff));
      expect(result.editorModel.mode).toBe("segment-list");
    });

    it("extracts segments with source text", () => {
      const result = xliffParser.parse(toBytes(sampleXliff));
      expect(result.segments).toHaveLength(3);
      expect(result.segments[0].source).toBe("Hello");
      expect(result.segments[1].source).toBe("World");
      expect(result.segments[2].source).toBe("Goodbye");
    });

    it("preserves existing target translations", () => {
      const result = xliffParser.parse(toBytes(sampleXliff));
      expect(result.segments[0].target).toBe("Hallo");
      expect(result.segments[1].target).toBeUndefined();
      expect(result.segments[2].target).toBe("Tschüss");
    });

    it("uses trans-unit id as segment id", () => {
      const result = xliffParser.parse(toBytes(sampleXliff));
      expect(result.segments[0].id).toBe("1");
      expect(result.segments[1].id).toBe("2");
      expect(result.segments[2].id).toBe("3");
    });

    it("returns no images", () => {
      const result = xliffParser.parse(toBytes(sampleXliff));
      expect(result.images).toEqual([]);
    });
  });

  describe("reconstruct", () => {
    it("injects translations into target elements", () => {
      const translations = new Map([
        ["2", "Welt"],
      ]);
      const result = xliffParser.reconstruct(toBytes(sampleXliff), translations);
      const output = new TextDecoder().decode(result);
      expect(output).toContain("Welt");
    });

    it("creates target elements when missing", () => {
      const translations = new Map([
        ["2", "Welt"],
      ]);
      const result = xliffParser.reconstruct(toBytes(sampleXliff), translations);
      const output = new TextDecoder().decode(result);
      // Unit 2 had no <target>, now it should
      expect(output).toMatch(/<target[^>]*>Welt<\/target>/);
    });
  });
});
