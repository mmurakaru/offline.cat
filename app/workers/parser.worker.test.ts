import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  extractPptxLayout,
  extractSegments,
  extractSlideImages,
} from "../lib/parsers/pptx";

const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:spPr>
          <a:xfrm>
            <a:off x="838200" y="365125"/>
            <a:ext cx="10515600" cy="1325563"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:r><a:t>Title</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>No position shape</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

function makePptx(
  slides: Record<string, string>,
  extra?: Record<string, Uint8Array>,
): Uint8Array {
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    "ppt/presentation.xml": encoder.encode(
      `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    ),
    ...extra,
  };
  for (const [name, xml] of Object.entries(slides)) {
    files[`ppt/slides/${name}`] = encoder.encode(xml);
  }
  return zipSync(files);
}

describe("parser worker: extractSegments and extractPptxLayout consistency", () => {
  it("extractPptxLayout returns regions for every segment from extractSegments", () => {
    const pptx = makePptx({ "slide1.xml": slideXml });

    const segments = extractSegments(pptx);
    const { layouts } = extractPptxLayout(pptx);

    const segmentIds = segments.map((s) => s.id);
    const regionIds = layouts.flatMap((l) => l.regions.map((r) => r.segmentId));

    expect(regionIds).toEqual(segmentIds);
  });

  it("extractPptxLayout works with Uint8Array from zipSync", () => {
    const pptx = makePptx({ "slide1.xml": slideXml });

    const asArrayBuffer = pptx.buffer.slice(
      pptx.byteOffset,
      pptx.byteOffset + pptx.byteLength,
    );
    const restored = new Uint8Array(asArrayBuffer);

    const { layouts } = extractPptxLayout(restored);
    expect(layouts).toHaveLength(1);
    expect(layouts[0].regions).toHaveLength(2);
  });

  it("extractPptxLayout works with raw ArrayBuffer (simulating worker deserialization)", () => {
    const pptx = makePptx({ "slide1.xml": slideXml });

    const asArrayBuffer = pptx.buffer.slice(
      pptx.byteOffset,
      pptx.byteOffset + pptx.byteLength,
    );

    const { layouts } = extractPptxLayout(new Uint8Array(asArrayBuffer));
    expect(layouts).toHaveLength(1);
    expect(layouts[0].regions).toHaveLength(2);
  });

  it("extractPptxLayout handles multiple slides", () => {
    const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Slide 2 content</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const pptx = makePptx({
      "slide1.xml": slideXml,
      "slide2.xml": slide2Xml,
    });

    const { layouts } = extractPptxLayout(pptx);

    expect(layouts).toHaveLength(2);
    expect(layouts[0].slideIndex).toBe(0);
    expect(layouts[1].slideIndex).toBe(1);
    expect(layouts[0].regions.length).toBeGreaterThan(0);
    expect(layouts[1].regions.length).toBeGreaterThan(0);
  });

  it("slide dimensions come from presentation.xml", () => {
    const pptx = makePptx({ "slide1.xml": slideXml });
    const { layouts } = extractPptxLayout(pptx);

    expect(layouts[0].width).toBe(1280);
    expect(layouts[0].height).toBe(720);
  });

  it("defaults to 960x540 when no presentation.xml", () => {
    const encoder = new TextEncoder();
    const files: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideXml),
    };
    const pptx = zipSync(files);

    const { layouts } = extractPptxLayout(pptx);
    expect(layouts[0].width).toBe(960);
    expect(layouts[0].height).toBe(540);
  });
});

describe("extractSlideImages", () => {
  it("extracts image bytes from zip files by media path", () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const files: Record<string, Uint8Array> = {
      "ppt/media/image1.png": imageBytes,
    };

    const images = extractSlideImages(files, ["ppt/media/image1.png"]);

    expect(images).toHaveLength(1);
    expect(images[0].mediaPath).toBe("ppt/media/image1.png");
    expect(images[0].bytes).toEqual(imageBytes);
    expect(images[0].contentType).toBe("image/png");
  });

  it("skips missing media files", () => {
    const images = extractSlideImages({}, ["ppt/media/missing.png"]);

    expect(images).toHaveLength(0);
  });
});
