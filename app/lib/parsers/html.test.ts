import { describe, expect, it } from "vitest";
import { extractSegments, reconstructHtml } from "./html";

describe("extractSegments", () => {
  it("extracts text nodes from HTML", () => {
    // Act
    const segments = extractSegments("<p>Hello</p><p>World</p>");

    // Assert
    expect(segments).toHaveLength(2);
    expect(segments[0].source).toBe("Hello");
    expect(segments[1].source).toBe("World");
  });

  it("skips empty text nodes", () => {
    // Act
    const segments = extractSegments("<div>  </div><p>Hello</p>");

    // Assert
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Hello");
  });

  it("assigns sequential ids", () => {
    // Act
    const segments = extractSegments("<p>One</p><p>Two</p><p>Three</p>");

    // Assert
    expect(segments[0].id).toBe("html-0");
    expect(segments[1].id).toBe("html-1");
    expect(segments[2].id).toBe("html-2");
  });

  it("returns empty array for HTML with no text", () => {
    // Act & Assert
    expect(extractSegments("<div><img /><br /></div>")).toEqual([]);
  });

  it("handles nested elements", () => {
    // Act
    const segments = extractSegments("<div><span>Nested</span></div>");

    // Assert
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Nested");
  });
});

describe("reconstructHtml", () => {
  it("replaces text with translations", () => {
    // Arrange
    const html = "<p>Hello</p><p>World</p>";
    const translations = new Map([
      ["html-0", "Hola"],
      ["html-1", "Mundo"],
    ]);

    // Act
    const result = reconstructHtml(html, translations);

    // Assert
    expect(result).toContain("Hola");
    expect(result).toContain("Mundo");
    expect(result).not.toContain("Hello");
    expect(result).not.toContain("World");
  });

  it("leaves untranslated segments unchanged", () => {
    // Arrange
    const translations = new Map([["html-0", "Hola"]]);

    // Act
    const result = reconstructHtml("<p>Hello</p><p>World</p>", translations);

    // Assert
    expect(result).toContain("Hola");
    expect(result).toContain("World");
  });
});

describe("roundtrip", () => {
  it("extract then reconstruct preserves structure and applies translations", () => {
    const html = "<h1>Title</h1><p>Body text</p>";
    const segments = extractSegments(html);

    const translations = new Map(
      segments.map((s) => [s.id, `translated-${s.source}`]),
    );
    const result = reconstructHtml(html, translations);

    expect(result).toContain("translated-Title");
    expect(result).toContain("translated-Body text");
    expect(result).toContain("<h1>");
    expect(result).toContain("<p>");
  });

  it("does not extract text from script or style tags", () => {
    const html =
      "<p>Visible</p><script>var x = 1;</script><style>.a { color: red; }</style><p>Also visible</p>";
    const segments = extractSegments(html);

    expect(segments.map((s) => s.source)).toEqual(["Visible", "Also visible"]);
  });

  it("preserves HTML attributes through roundtrip", () => {
    const html = '<a href="https://example.com" class="link">Click me</a>';
    extractSegments(html);
    const translations = new Map([["html-0", "Haz clic"]]);
    const result = reconstructHtml(html, translations);

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('class="link"');
    expect(result).toContain("Haz clic");
  });
});
