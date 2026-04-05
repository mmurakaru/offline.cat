// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractSegments, reconstructXliff } from "./xliff";

const sampleXliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es">
    <body>
      <trans-unit id="1">
        <source>Hello world</source>
      </trans-unit>
      <trans-unit id="2">
        <source>Goodbye</source>
        <target>Adiós</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;

describe("extractSegments", () => {
  it("extracts source text from trans-units", () => {
    // Act
    const segments = extractSegments(sampleXliff);

    // Assert
    expect(segments).toHaveLength(2);
    expect(segments[0].source).toBe("Hello world");
    expect(segments[1].source).toBe("Goodbye");
  });

  it("preserves existing target translations", () => {
    // Act
    const segments = extractSegments(sampleXliff);

    // Assert
    expect(segments[0].target).toBeUndefined();
    expect(segments[1].target).toBe("Adiós");
  });

  it("preserves trans-unit ids", () => {
    // Act
    const segments = extractSegments(sampleXliff);

    // Assert
    expect(segments[0].id).toBe("1");
    expect(segments[1].id).toBe("2");
  });

  it("returns empty array for XLIFF with no trans-units", () => {
    // Act & Assert
    const empty = `<?xml version="1.0"?><xliff><file><body></body></file></xliff>`;
    expect(extractSegments(empty)).toEqual([]);
  });
});

describe("reconstructXliff", () => {
  it("inserts translations into target elements", () => {
    // Arrange
    const translations = new Map([
      ["1", "Hola mundo"],
      ["2", "Adiós"],
    ]);

    // Act
    const result = reconstructXliff(sampleXliff, translations);

    // Assert
    expect(result).toContain("Hola mundo");
  });

  it("creates target element if missing", () => {
    // Arrange
    const translations = new Map([["1", "Hola mundo"]]);

    // Act
    const result = reconstructXliff(sampleXliff, translations);

    // Assert
    const doc = new DOMParser().parseFromString(result, "text/xml");
    const target = doc.querySelector('trans-unit[id="1"] target');
    expect(target).not.toBeNull();
    expect(target?.textContent).toBe("Hola mundo");
  });

  it("leaves untranslated units unchanged", () => {
    // Arrange
    const translations = new Map<string, string>();

    // Act
    const result = reconstructXliff(sampleXliff, translations);

    // Assert
    expect(result).toContain("Hello world");
  });
});
