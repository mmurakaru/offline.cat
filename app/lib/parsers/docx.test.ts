import { describe, expect, it } from "vitest";
import { extractTextFromDocumentXml, replaceTextInDocumentXml } from "./docx";

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
    const segments = extractTextFromDocumentXml(documentXml);
    expect(segments).toHaveLength(2);
    expect(segments[0].source).toBe("Hello world");
    expect(segments[1].source).toBe("Second paragraph");
  });

  it("assigns sequential paragraph ids", () => {
    const segments = extractTextFromDocumentXml(documentXml);
    expect(segments[0].id).toBe("docx-p0");
    expect(segments[1].id).toBe("docx-p1");
  });

  it("joins multiple runs within a paragraph", () => {
    const segments = extractTextFromDocumentXml(multiRunXml);
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Hello world");
  });

  it("skips empty paragraphs", () => {
    const emptyXml = `<?xml version="1.0"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>   </w:t></w:r></w:p>
        <w:p><w:r><w:t>Real text</w:t></w:r></w:p>
      </w:body>
    </w:document>`;
    const segments = extractTextFromDocumentXml(emptyXml);
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Real text");
  });

  it("returns empty for XML with no paragraphs", () => {
    const xml = `<?xml version="1.0"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body></w:body>
    </w:document>`;
    expect(extractTextFromDocumentXml(xml)).toEqual([]);
  });
});

describe("replaceTextInDocumentXml", () => {
  it("replaces text in paragraphs", () => {
    const translations = new Map([
      ["docx-p0", "Hola mundo"],
      ["docx-p1", "Segundo párrafo"],
    ]);
    const result = replaceTextInDocumentXml(documentXml, translations);
    expect(result).toContain("Hola mundo");
    expect(result).toContain("Segundo párrafo");
    expect(result).not.toContain("Hello world");
  });

  it("leaves untranslated paragraphs unchanged", () => {
    const translations = new Map([["docx-p0", "Hola mundo"]]);
    const result = replaceTextInDocumentXml(documentXml, translations);
    expect(result).toContain("Hola mundo");
    expect(result).toContain("Second paragraph");
  });

  it("distributes translation proportionally across multiple runs", () => {
    // Original runs: "Hello " (6 chars) and "world" (5 chars) = 11 total
    // Translation: "Hola mundo" (10 chars)
    // Proportional: 6/11*10 = 5.45 -> 5, 5/11*10 = 4.54 -> 5 (remainder goes to second)
    const translations = new Map([["docx-p0", "Hola mundo"]]);
    const result = replaceTextInDocumentXml(multiRunXml, translations);
    // Both runs should have text (not all in first run)
    expect(result).toContain("Hola ");
    expect(result).toContain("mundo");
    expect(result).not.toContain("Hello ");
    expect(result).not.toContain("world");
  });
});
