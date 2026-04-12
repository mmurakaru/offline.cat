import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  extractDocxLayout,
  extractDocxLayoutFromXml,
  extractTextFromDocumentXml,
  replaceTextInDocumentXml,
} from "./docx";

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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

const multiRunXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello </w:t>
      </w:r>
      <w:r>
        <w:t>world</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

describe("extractTextFromDocumentXml", () => {
  it("extracts paragraphs from document XML", () => {
    // Act
    const segments = extractTextFromDocumentXml(documentXml);

    // Assert
    expect(segments).toHaveLength(2);
    expect(segments[0].source).toBe("Hello world");
    expect(segments[1].source).toBe("Second paragraph");
  });

  it("assigns sequential paragraph ids", () => {
    // Act
    const segments = extractTextFromDocumentXml(documentXml);

    // Assert
    expect(segments[0].id).toBe("docx-p0");
    expect(segments[1].id).toBe("docx-p1");
  });

  it("joins multiple runs within a paragraph", () => {
    // Act
    const segments = extractTextFromDocumentXml(multiRunXml);

    // Assert
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Hello world");
  });

  it("skips empty paragraphs", () => {
    // Arrange
    const emptyXml = `<?xml version="1.0"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>   </w:t></w:r></w:p>
        <w:p><w:r><w:t>Real text</w:t></w:r></w:p>
      </w:body>
    </w:document>`;

    // Act
    const segments = extractTextFromDocumentXml(emptyXml);

    // Assert
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Real text");
  });

  it("returns empty for XML with no paragraphs", () => {
    // Arrange
    const xml = `<?xml version="1.0"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body></w:body>
    </w:document>`;

    // Act & Assert
    expect(extractTextFromDocumentXml(xml)).toEqual([]);
  });
});

describe("extractDocxLayoutFromXml", () => {
  // A4 page: 11906 x 16838 twips, margins 1417 top/bottom, 1134 left/right
  const sectPrXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1701"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  it("extracts page dimensions from w:sectPr", () => {
    const layout = extractDocxLayoutFromXml(sectPrXml);

    // 11906 / 20 = 595.3, 16838 / 20 = 841.9
    expect(layout.pageDimensions.widthPt).toBeCloseTo(595.3, 1);
    expect(layout.pageDimensions.heightPt).toBeCloseTo(841.9, 1);
    // 1417 / 20 = 70.85, 1134 / 20 = 56.7, 1701 / 20 = 85.05
    expect(layout.pageDimensions.marginTopPt).toBeCloseTo(70.85, 1);
    expect(layout.pageDimensions.marginBottomPt).toBeCloseTo(56.7, 1);
    expect(layout.pageDimensions.marginLeftPt).toBeCloseTo(85.05, 1);
    expect(layout.pageDimensions.marginRightPt).toBeCloseTo(56.7, 1);
  });

  it("uses US Letter defaults when w:sectPr is missing", () => {
    const layout = extractDocxLayoutFromXml(documentXml);

    expect(layout.pageDimensions.widthPt).toBe(612);
    expect(layout.pageDimensions.heightPt).toBe(792);
  });

  it("extracts paragraph styling from w:pPr", () => {
    const styledXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="240" w:after="120"/>
        <w:ind w:left="720" w:firstLine="360"/>
      </w:pPr>
      <w:r><w:t>Centered text</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

    const layout = extractDocxLayoutFromXml(styledXml);
    const block = layout.blocks[0];
    if (block.type !== "paragraph") throw new Error("expected paragraph");

    expect(block.paragraphStyle.alignment).toBe("center");
    expect(block.paragraphStyle.spacingBeforePt).toBe(12); // 240 twips / 20
    expect(block.paragraphStyle.spacingAfterPt).toBe(6); // 120 twips / 20
    expect(block.paragraphStyle.indentLeftPt).toBe(36); // 720 twips / 20
    expect(block.paragraphStyle.indentFirstLinePt).toBe(18); // 360 twips / 20
  });

  it("extracts dominant run style from w:rPr", () => {
    const runStyleXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:i/>
          <w:u w:val="single"/>
          <w:sz w:val="28"/>
          <w:color w:val="FF0000"/>
          <w:rFonts w:ascii="Arial"/>
        </w:rPr>
        <w:t>Styled text</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    const layout = extractDocxLayoutFromXml(runStyleXml);
    const block = layout.blocks[0];
    if (block.type !== "paragraph") throw new Error("expected paragraph");

    expect(block.dominantRunStyle.bold).toBe(true);
    expect(block.dominantRunStyle.italic).toBe(true);
    expect(block.dominantRunStyle.underline).toBe(true);
    expect(block.dominantRunStyle.sizePoints).toBe(14); // 28 half-points / 2
    expect(block.dominantRunStyle.color).toBe("#FF0000");
    expect(block.dominantRunStyle.fontFamily).toBe("Arial");
  });

  it("picks the longest run's style as dominant", () => {
    const twoRunXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="20"/></w:rPr>
        <w:t>Hi </w:t>
      </w:r>
      <w:r>
        <w:rPr><w:i/><w:sz w:val="24"/></w:rPr>
        <w:t>there friend</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    const layout = extractDocxLayoutFromXml(twoRunXml);
    const block = layout.blocks[0];
    if (block.type !== "paragraph") throw new Error("expected paragraph");

    // Second run "there friend" (12 chars) is longer than "Hi " (3 chars)
    expect(block.dominantRunStyle.italic).toBe(true);
    expect(block.dominantRunStyle.bold).toBeUndefined();
    expect(block.dominantRunStyle.sizePoints).toBe(12); // 24 / 2
  });

  it("detects page breaks as non-text blocks", () => {
    const pageBreakXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Before break</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:r><w:t>After break</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const layout = extractDocxLayoutFromXml(pageBreakXml);

    expect(layout.blocks).toHaveLength(3);
    expect(layout.blocks[0].type).toBe("paragraph");
    expect(layout.blocks[1].type).toBe("pageBreak");
    expect(layout.blocks[2].type).toBe("paragraph");
  });

  it("detects tables as non-text blocks", () => {
    const tableXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Before table</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>After table</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const layout = extractDocxLayoutFromXml(tableXml);

    expect(layout.blocks).toHaveLength(3);
    expect(layout.blocks[0].type).toBe("paragraph");
    expect(layout.blocks[1].type).toBe("table");
    expect(layout.blocks[2].type).toBe("paragraph");
  });

  it("skips empty paragraphs and keeps segment IDs in sync", () => {
    const emptyParagraphXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First</w:t></w:r></w:p>
    <w:p><w:r><w:t>   </w:t></w:r></w:p>
    <w:p></w:p>
    <w:p><w:r><w:t>Second</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const layout = extractDocxLayoutFromXml(emptyParagraphXml);
    const segments = extractTextFromDocumentXml(emptyParagraphXml);

    const paragraphs = layout.blocks.filter((b) => b.type === "paragraph");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs).toHaveLength(segments.length);

    for (let index = 0; index < segments.length; index++) {
      const block = paragraphs[index];
      if (block.type !== "paragraph") continue;
      expect(block.segmentId).toBe(segments[index].id);
    }
  });

  it("extracts paragraph blocks with segment IDs matching extractTextFromDocumentXml", () => {
    const layout = extractDocxLayoutFromXml(documentXml);
    const segments = extractTextFromDocumentXml(documentXml);

    const paragraphBlocks = layout.blocks.filter(
      (block) => block.type === "paragraph",
    );

    expect(paragraphBlocks).toHaveLength(segments.length);
    for (let index = 0; index < segments.length; index++) {
      const block = paragraphBlocks[index];
      if (block.type !== "paragraph") continue;
      expect(block.segmentId).toBe(segments[index].id);
      expect(block.text).toBe(segments[index].source);
    }
  });
});

describe("extractDocxLayoutFromXml - images", () => {
  it("detects inline images as image blocks with media paths", () => {
    const imageXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Before image</w:t></w:r></w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <a:graphic>
              <a:graphicData>
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:blipFill>
                    <a:blip r:embed="rId5"/>
                  </pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p><w:r><w:t>After image</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const relationships = new Map([["rId5", "word/media/image1.png"]]);
    const layout = extractDocxLayoutFromXml(imageXml, relationships);

    expect(layout.blocks).toHaveLength(3);
    expect(layout.blocks[0].type).toBe("paragraph");
    expect(layout.blocks[1].type).toBe("image");
    if (layout.blocks[1].type === "image") {
      expect(layout.blocks[1].mediaPath).toBe("word/media/image1.png");
    }
    expect(layout.blocks[2].type).toBe("paragraph");
  });
});

describe("extractDocxLayout (from zip)", () => {
  it("extracts layout from a zipped DOCX file", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1701"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const docxZip = zipSync({
      "word/document.xml": new TextEncoder().encode(xml),
    });

    const { layout } = extractDocxLayout(docxZip);

    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0].type).toBe("paragraph");
    expect(layout.pageDimensions.widthPt).toBeCloseTo(595.3, 1);
  });

  it("returns default layout when word/document.xml is missing", () => {
    const emptyZip = zipSync({});

    const { layout } = extractDocxLayout(emptyZip);

    expect(layout.blocks).toHaveLength(0);
    expect(layout.pageDimensions.widthPt).toBe(612);
  });

  it("extracts images from zip with relationships", () => {
    const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <a:graphic>
              <a:graphicData>
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:blipFill>
                    <a:blip r:embed="rId5"/>
                  </pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

    const fakeImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header

    const docxZip = zipSync({
      "word/document.xml": new TextEncoder().encode(xml),
      "word/_rels/document.xml.rels": new TextEncoder().encode(rels),
      "word/media/image1.png": fakeImage,
    });

    const { layout, mediaPaths } = extractDocxLayout(docxZip);

    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0].type).toBe("image");
    expect(mediaPaths).toEqual(["word/media/image1.png"]);
  });
});

describe("replaceTextInDocumentXml", () => {
  it("replaces text in paragraphs", () => {
    // Arrange
    const translations = new Map([
      ["docx-p0", "Hola mundo"],
      ["docx-p1", "Segundo párrafo"],
    ]);

    // Act
    const result = replaceTextInDocumentXml(documentXml, translations);

    // Assert
    expect(result).toContain("Hola mundo");
    expect(result).toContain("Segundo párrafo");
    expect(result).not.toContain("Hello world");
  });

  it("leaves untranslated paragraphs unchanged", () => {
    // Arrange
    const translations = new Map([["docx-p0", "Hola mundo"]]);

    // Act
    const result = replaceTextInDocumentXml(documentXml, translations);

    // Assert
    expect(result).toContain("Hola mundo");
    expect(result).toContain("Second paragraph");
  });

  it("distributes translation proportionally across multiple runs", () => {
    // Arrange - original runs: "Hello " (6 chars) and "world" (5 chars)
    const translations = new Map([["docx-p0", "Hola mundo"]]);

    // Act
    const result = replaceTextInDocumentXml(multiRunXml, translations);

    // Assert - both runs should have text, not all in first run
    expect(result).toContain("Hola ");
    expect(result).toContain("mundo");
    expect(result).not.toContain("Hello ");
    expect(result).not.toContain("world");
  });
});
