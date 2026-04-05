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
