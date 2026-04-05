import { describe, expect, it } from "vitest";
import { extractTextFromSlideXml, replaceTextInSlideXml } from "./pptx";

const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r>
              <a:t>Hello world</a:t>
            </a:r>
          </a:p>
          <a:p>
            <a:r>
              <a:t>Second paragraph</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r>
              <a:t>Another shape</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const multiRunXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r>
              <a:t>Hello </a:t>
            </a:r>
            <a:r>
              <a:t>world</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

describe("extractTextFromSlideXml", () => {
  it("extracts paragraphs from slide XML", () => {
    // Act
    const segments = extractTextFromSlideXml(slideXml, 0);

    // Assert
    expect(segments).toHaveLength(3);
    expect(segments[0].source).toBe("Hello world");
    expect(segments[1].source).toBe("Second paragraph");
    expect(segments[2].source).toBe("Another shape");
  });

  it("assigns correct slide index", () => {
    // Act
    const segments = extractTextFromSlideXml(slideXml, 2);

    // Assert
    expect(segments[0].slideIndex).toBe(2);
    expect(segments[0].id).toBe("pptx-s2-p0");
  });

  it("assigns sequential paragraph ids per slide", () => {
    // Act
    const segments = extractTextFromSlideXml(slideXml, 0);

    // Assert
    expect(segments[0].id).toBe("pptx-s0-p0");
    expect(segments[1].id).toBe("pptx-s0-p1");
    expect(segments[2].id).toBe("pptx-s0-p2");
  });

  it("joins multiple runs within a paragraph", () => {
    // Act
    const segments = extractTextFromSlideXml(multiRunXml, 0);

    // Assert
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Hello world");
  });

  it("skips empty paragraphs", () => {
    // Arrange
    const emptyXml = `<?xml version="1.0"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody>
        <a:p><a:r><a:t>   </a:t></a:r></a:p>
        <a:p><a:r><a:t>Real text</a:t></a:r></a:p>
      </p:txBody></p:sp></p:spTree></p:cSld>
    </p:sld>`;

    // Act
    const segments = extractTextFromSlideXml(emptyXml, 0);

    // Assert
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Real text");
  });
});

describe("replaceTextInSlideXml", () => {
  it("replaces text in paragraphs", () => {
    // Arrange
    const translations = new Map([
      ["pptx-s0-p0", "Hola mundo"],
      ["pptx-s0-p1", "Segundo párrafo"],
    ]);

    // Act
    const result = replaceTextInSlideXml(slideXml, translations, 0);

    // Assert
    expect(result).toContain("Hola mundo");
    expect(result).toContain("Segundo párrafo");
    expect(result).not.toContain("Hello world");
    expect(result).not.toContain("Second paragraph");
  });

  it("leaves untranslated paragraphs unchanged", () => {
    // Arrange
    const translations = new Map([["pptx-s0-p0", "Hola mundo"]]);

    // Act
    const result = replaceTextInSlideXml(slideXml, translations, 0);

    // Assert
    expect(result).toContain("Hola mundo");
    expect(result).toContain("Second paragraph");
  });

  it("distributes translation proportionally across multiple runs", () => {
    // Arrange - original runs: "Hello " (6 chars) and "world" (5 chars)
    const translations = new Map([["pptx-s0-p0", "Hola mundo"]]);

    // Act
    const result = replaceTextInSlideXml(multiRunXml, translations, 0);

    // Assert - both runs should have text, not all in first run
    expect(result).toContain("Hola ");
    expect(result).toContain("mundo");
    expect(result).not.toContain("Hello ");
    expect(result).not.toContain("world");
  });
});
