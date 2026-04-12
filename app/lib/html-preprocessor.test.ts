import { describe, expect, it } from "vitest";
import { preprocessHtml } from "./html-preprocessor";
import { extractSegments } from "./parsers/html";

describe("preprocessHtml", () => {
  it("skips script, style, and noscript content", () => {
    const html =
      '<p>Visible</p><script>alert("hi")</script><style>body{}</style><noscript>No JS</noscript><p>Also visible</p>';
    const result = preprocessHtml(html);

    expect(result.segmentCount).toBe(2);
    expect(result.html).toContain('data-segment-id="html-0"');
    expect(result.html).toContain('data-segment-id="html-1"');
    expect(result.html).not.toContain('data-segment-id="html-2"');
    // script/style/noscript content should be preserved as-is
    expect(result.html).toContain('alert("hi")');
    expect(result.html).toContain("body{}");
  });

  it("extracts style block content", () => {
    const html = "<style>.heading { color: red; }</style><p>Hello</p>";
    const result = preprocessHtml(html);

    expect(result.styles).toContain(".heading { color: red; }");
    expect(result.segmentCount).toBe(1);
  });

  it("preserves HTML structure with nested elements", () => {
    const html = '<div class="container"><h1>Title</h1><p>Body text</p></div>';
    const result = preprocessHtml(html);

    // Tags should be preserved
    expect(result.html).toContain('<div class="container">');
    expect(result.html).toContain("</div>");
    // Text nodes wrapped with segment IDs
    expect(result.html).toContain(
      '<span data-segment-id="html-0">Title</span>',
    );
    expect(result.html).toContain(
      '<span data-segment-id="html-1">Body text</span>',
    );
    expect(result.segmentCount).toBe(2);
  });

  it("handles text with no surrounding tags", () => {
    const html = "Just plain text";
    const result = preprocessHtml(html);

    expect(result.html).toContain('data-segment-id="html-0"');
    expect(result.segmentCount).toBe(1);
  });

  it("annotates text nodes with segment IDs matching extractSegments", () => {
    const html = "<p>Hello</p><p>World</p>";
    const result = preprocessHtml(html);
    const segments = extractSegments(html);

    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(result.html).toContain(`data-segment-id="${segment.id}"`);
    }
    expect(result.segmentCount).toBe(2);
  });

  it("maintains segment ID parity on complex HTML with mixed content", () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test</title><style>body { margin: 0; }</style></head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main>
    <h1>Welcome</h1>
    <p>First paragraph</p>
    <script>console.log("skip")</script>
    <p>Second paragraph</p>
  </main>
  <footer>Copyright 2024</footer>
</body>
</html>`;

    const result = preprocessHtml(html);
    const segments = extractSegments(html);

    expect(result.segmentCount).toBe(segments.length);
    for (const segment of segments) {
      expect(result.html).toContain(`data-segment-id="${segment.id}"`);
    }
  });
});
