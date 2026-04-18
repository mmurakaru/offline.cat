import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { pptxParser } from "./pptx-adapter";

const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1143000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="2800" b="1"/>
              <a:t>Slide Title</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Body 2"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1600200"/>
            <a:ext cx="8229600" cy="4525963"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p>
            <a:r>
              <a:t>Body text content</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`;

function makePptx(
  slides: string[],
  extras?: Record<string, Uint8Array>,
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "ppt/presentation.xml": new TextEncoder().encode(presentationXml),
    ...extras,
  };
  for (let index = 0; index < slides.length; index++) {
    files[`ppt/slides/slide${index + 1}.xml`] = new TextEncoder().encode(
      slides[index],
    );
  }
  return zipSync(files);
}

describe("pptxParser", () => {
  it("has correct extensions", () => {
    expect(pptxParser.extensions).toEqual(["pptx"]);
  });

  describe("parse", () => {
    it("returns slide editor model", () => {
      const result = pptxParser.parse(makePptx([slideXml]));
      expect(result.editorModel.mode).toBe("slide");
    });

    it("extracts segments from slide text", () => {
      const result = pptxParser.parse(makePptx([slideXml]));
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
      const sources = result.segments.map((segment) => segment.source);
      expect(sources).toContain("Slide Title");
      expect(sources).toContain("Body text content");
    });

    it("returns ParsedSegment shape (no slideIndex or xmlPath)", () => {
      const result = pptxParser.parse(makePptx([slideXml]));
      for (const segment of result.segments) {
        expect(segment).not.toHaveProperty("slideIndex");
        expect(segment).not.toHaveProperty("xmlPath");
      }
    });

    it("extracts slide layout with normalized field names", () => {
      const result = pptxParser.parse(makePptx([slideXml]));
      if (result.editorModel.mode !== "slide") throw new Error("wrong mode");
      expect(result.editorModel.slides).toHaveLength(1);

      const slide = result.editorModel.slides[0];
      // Normalized: index (not slideIndex)
      expect(slide.index).toBe(0);
      // Slide dimensions from presentation.xml (9144000 EMU / 9525 = 960px)
      expect(slide.width).toBe(960);
      expect(slide.height).toBe(720);
    });

    it("extracts text regions with positions", () => {
      const result = pptxParser.parse(makePptx([slideXml]));
      if (result.editorModel.mode !== "slide") throw new Error("wrong mode");

      const slide = result.editorModel.slides[0];
      expect(slide.regions.length).toBeGreaterThanOrEqual(1);

      for (const region of slide.regions) {
        expect(region).toHaveProperty("segmentId");
        expect(region).toHaveProperty("x");
        expect(region).toHaveProperty("y");
        expect(region).toHaveProperty("width");
        expect(region).toHaveProperty("height");
        expect(region).toHaveProperty("zIndex");
      }
    });

    it("uses normalized font style fields", () => {
      const result = pptxParser.parse(makePptx([slideXml]));
      if (result.editorModel.mode !== "slide") throw new Error("wrong mode");

      const slide = result.editorModel.slides[0];
      const regionWithFont = slide.regions.find(
        (region) => region.fontStyle?.sizePt !== undefined,
      );
      if (regionWithFont?.fontStyle) {
        // Normalized: sizePt (not sizePoints)
        expect(regionWithFont.fontStyle).toHaveProperty("sizePt");
        expect(regionWithFont.fontStyle).not.toHaveProperty("sizePoints");
        // lineSpacingPt (not lineSpacingPoints) if present
        if ("lineSpacingPt" in regionWithFont.fontStyle) {
          expect(regionWithFont.fontStyle).not.toHaveProperty(
            "lineSpacingPoints",
          );
        }
      }
    });

    it("handles multiple slides", () => {
      const slide2Xml = slideXml.replace("Slide Title", "Second Slide");
      const result = pptxParser.parse(makePptx([slideXml, slide2Xml]));
      if (result.editorModel.mode !== "slide") throw new Error("wrong mode");
      expect(result.editorModel.slides).toHaveLength(2);
      expect(result.editorModel.slides[0].index).toBe(0);
      expect(result.editorModel.slides[1].index).toBe(1);
    });

    it("returns no images for slides without media", () => {
      const result = pptxParser.parse(makePptx([slideXml]));
      expect(result.images).toEqual([]);
    });
  });

  describe("reconstruct", () => {
    it("produces valid output", () => {
      const data = makePptx([slideXml]);
      const translations = new Map([["pptx-s0-p0", "Folientitel"]]);
      const result = pptxParser.reconstruct(data, translations);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it("round-trips: parse then reconstruct preserves segments", () => {
      const data = makePptx([slideXml]);
      const parseResult = pptxParser.parse(data);
      const translations = new Map(
        parseResult.segments.map((segment) => [segment.id, segment.source]),
      );
      const reconstructed = pptxParser.reconstruct(data, translations);
      const reparsed = pptxParser.parse(reconstructed);
      expect(reparsed.segments.map((segment) => segment.source)).toEqual(
        parseResult.segments.map((segment) => segment.source),
      );
    });
  });
});
