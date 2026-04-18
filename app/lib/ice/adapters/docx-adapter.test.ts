import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxParser } from "./docx-adapter";

function makeDocx(
  documentXml: string,
  extras?: Record<string, Uint8Array>,
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "word/document.xml": new TextEncoder().encode(documentXml),
    ...extras,
  };
  return zipSync(files);
}

const simpleDocumentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello world</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Second paragraph</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

const styledDocumentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="28"/>
          <w:color w:val="FF0000"/>
        </w:rPr>
        <w:t>Bold centered text</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:bottom="1440" w:left="1800" w:right="1800"/>
    </w:sectPr>
  </w:body>
</w:document>`;

describe("docxParser", () => {
  it("has correct extensions", () => {
    expect(docxParser.extensions).toEqual(["docx"]);
  });

  describe("parse", () => {
    it("returns page editor model", () => {
      const result = docxParser.parse(makeDocx(simpleDocumentXml));
      expect(result.editorModel.mode).toBe("page");
    });

    it("extracts segments from paragraphs", () => {
      const result = docxParser.parse(makeDocx(simpleDocumentXml));
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        id: "docx-p0",
        source: "Hello world",
      });
      expect(result.segments[1]).toEqual({
        id: "docx-p1",
        source: "Second paragraph",
      });
    });

    it("returns ParsedSegment shape (no xmlPath)", () => {
      const result = docxParser.parse(makeDocx(simpleDocumentXml));
      for (const segment of result.segments) {
        expect(segment).not.toHaveProperty("xmlPath");
      }
    });

    it("extracts page dimensions from sectPr", () => {
      const result = docxParser.parse(makeDocx(styledDocumentXml));
      if (result.editorModel.mode !== "page") throw new Error("wrong mode");
      // 12240 twips / 20 = 612pt, 15840 / 20 = 792pt
      expect(result.editorModel.pageDimensions.widthPt).toBe(612);
      expect(result.editorModel.pageDimensions.heightPt).toBe(792);
      // 1440 twips / 20 = 72pt
      expect(result.editorModel.pageDimensions.marginTopPt).toBe(72);
      expect(result.editorModel.pageDimensions.marginBottomPt).toBe(72);
      // 1800 twips / 20 = 90pt
      expect(result.editorModel.pageDimensions.marginLeftPt).toBe(90);
      expect(result.editorModel.pageDimensions.marginRightPt).toBe(90);
    });

    it("maps paragraph blocks with normalized field names", () => {
      const result = docxParser.parse(makeDocx(styledDocumentXml));
      if (result.editorModel.mode !== "page") throw new Error("wrong mode");
      const paragraph = result.editorModel.blocks.find(
        (block) => block.type === "paragraph",
      );
      expect(paragraph).toBeDefined();
      if (paragraph?.type !== "paragraph") throw new Error("wrong block type");

      // Normalized field names
      expect(paragraph.style).toBeDefined();
      expect(paragraph.style.alignment).toBe("center");
      expect(paragraph.runStyle).toBeDefined();
      expect(paragraph.runStyle.bold).toBe(true);
      // sizePoints -> sizePt
      expect(paragraph.runStyle.sizePt).toBe(14);
      expect(paragraph.runStyle.color).toBe("#FF0000");
    });

    it("uses default page dimensions when sectPr is missing", () => {
      const result = docxParser.parse(makeDocx(simpleDocumentXml));
      if (result.editorModel.mode !== "page") throw new Error("wrong mode");
      // US Letter defaults
      expect(result.editorModel.pageDimensions.widthPt).toBe(612);
      expect(result.editorModel.pageDimensions.heightPt).toBe(792);
    });

    it("returns no images for document without media", () => {
      const result = docxParser.parse(makeDocx(simpleDocumentXml));
      expect(result.images).toEqual([]);
    });
  });

  describe("reconstruct", () => {
    it("replaces text with translations", () => {
      const data = makeDocx(simpleDocumentXml);
      const translations = new Map([
        ["docx-p0", "Hallo Welt"],
        ["docx-p1", "Zweiter Absatz"],
      ]);
      const result = docxParser.reconstruct(data, translations);
      // Result is a valid zip
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it("round-trips: parse then reconstruct produces valid output", () => {
      const data = makeDocx(simpleDocumentXml);
      const parseResult = docxParser.parse(data);
      // Use original source as "translations" for identity round-trip
      const translations = new Map(
        parseResult.segments.map((segment) => [segment.id, segment.source]),
      );
      const reconstructed = docxParser.reconstruct(data, translations);
      // Re-parse the reconstructed output
      const reparsed = docxParser.parse(reconstructed);
      expect(reparsed.segments.map((segment) => segment.source)).toEqual(
        parseResult.segments.map((segment) => segment.source),
      );
    });
  });
});
