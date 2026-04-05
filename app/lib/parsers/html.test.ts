// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractSegments, reconstructHtml } from "./html";

describe("extractSegments", () => {
  it("extracts text nodes from HTML", () => {
    const html = "<p>Hello</p><p>World</p>";
    const segments = extractSegments(html);
    expect(segments).toHaveLength(2);
    expect(segments[0].source).toBe("Hello");
    expect(segments[1].source).toBe("World");
  });

  it("skips empty text nodes", () => {
    const html = "<div>  </div><p>Hello</p>";
    const segments = extractSegments(html);
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Hello");
  });

  it("assigns sequential ids", () => {
    const html = "<p>One</p><p>Two</p><p>Three</p>";
    const segments = extractSegments(html);
    expect(segments[0].id).toBe("html-0");
    expect(segments[1].id).toBe("html-1");
    expect(segments[2].id).toBe("html-2");
  });

  it("returns empty array for HTML with no text", () => {
    const html = "<div><img /><br /></div>";
    const segments = extractSegments(html);
    expect(segments).toEqual([]);
  });

  it("handles nested elements", () => {
    const html = "<div><span>Nested</span></div>";
    const segments = extractSegments(html);
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Nested");
  });
});

describe("reconstructHtml", () => {
  it("replaces text with translations", () => {
    const html = "<p>Hello</p><p>World</p>";
    const translations = new Map([
      ["html-0", "Hola"],
      ["html-1", "Mundo"],
    ]);
    const result = reconstructHtml(html, translations);
    expect(result).toContain("Hola");
    expect(result).toContain("Mundo");
    expect(result).not.toContain("Hello");
    expect(result).not.toContain("World");
  });

  it("leaves untranslated segments unchanged", () => {
    const html = "<p>Hello</p><p>World</p>";
    const translations = new Map([["html-0", "Hola"]]);
    const result = reconstructHtml(html, translations);
    expect(result).toContain("Hola");
    expect(result).toContain("World");
  });
});
