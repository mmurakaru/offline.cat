import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  extractFontStyle,
  extractImageRef,
  extractLayoutPlaceholderPositions,
  extractLineColor,
  extractPptxLayout,
  extractSlideBackground,
  extractSlideLayout,
  extractSolidFill,
  extractTextFromSlideXml,
  parseMasterTextStyles,
  parseRelationships,
  parseThemeColors,
  replaceTextInSlideXml,
} from "./pptx";

// biome-ignore lint/suspicious/noExplicitAny: test helpers use raw XML parser output
type XmlNode = any;

const { XMLParser } = await import("fast-xml-parser");
const testParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  trimValues: false,
});

function parseXml(xml: string): XmlNode[] {
  return testParser.parse(xml);
}

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
    const segments = extractTextFromSlideXml(slideXml, 0);

    expect(segments).toHaveLength(3);
    expect(segments[0].source).toBe("Hello world");
    expect(segments[1].source).toBe("Second paragraph");
    expect(segments[2].source).toBe("Another shape");
  });

  it("assigns correct slide index", () => {
    const segments = extractTextFromSlideXml(slideXml, 2);

    expect(segments[0].slideIndex).toBe(2);
    expect(segments[0].id).toBe("pptx-s2-p0");
  });

  it("assigns sequential paragraph ids per slide", () => {
    const segments = extractTextFromSlideXml(slideXml, 0);

    expect(segments[0].id).toBe("pptx-s0-p0");
    expect(segments[1].id).toBe("pptx-s0-p1");
    expect(segments[2].id).toBe("pptx-s0-p2");
  });

  it("joins multiple runs within a paragraph", () => {
    const segments = extractTextFromSlideXml(multiRunXml, 0);

    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Hello world");
  });

  it("skips empty paragraphs", () => {
    const emptyXml = `<?xml version="1.0"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody>
        <a:p><a:r><a:t>   </a:t></a:r></a:p>
        <a:p><a:r><a:t>Real text</a:t></a:r></a:p>
      </p:txBody></p:sp></p:spTree></p:cSld>
    </p:sld>`;

    const segments = extractTextFromSlideXml(emptyXml, 0);

    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe("Real text");
  });
});

describe("replaceTextInSlideXml", () => {
  it("replaces text in paragraphs", () => {
    const translations = new Map([
      ["pptx-s0-p0", "Hola mundo"],
      ["pptx-s0-p1", "Segundo párrafo"],
    ]);

    const result = replaceTextInSlideXml(slideXml, translations, 0);

    expect(result).toContain("Hola mundo");
    expect(result).toContain("Segundo párrafo");
    expect(result).not.toContain("Hello world");
    expect(result).not.toContain("Second paragraph");
  });

  it("leaves untranslated paragraphs unchanged", () => {
    const translations = new Map([["pptx-s0-p0", "Hola mundo"]]);

    const result = replaceTextInSlideXml(slideXml, translations, 0);

    expect(result).toContain("Hola mundo");
    expect(result).toContain("Second paragraph");
  });

  it("distributes translation proportionally across multiple runs", () => {
    const translations = new Map([["pptx-s0-p0", "Hola mundo"]]);

    const result = replaceTextInSlideXml(multiRunXml, translations, 0);

    expect(result).toContain("Hola ");
    expect(result).toContain("mundo");
    expect(result).not.toContain("Hello ");
    expect(result).not.toContain("world");
  });
});

// --- Phase 1: New extraction function tests ---

describe("parseRelationships", () => {
  it("parses standard rels XML with relative paths", () => {
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
    </Relationships>`;

    const rels = parseRelationships(relsXml);

    expect(rels.get("rId1")).toBe("ppt/slideLayouts/slideLayout1.xml");
    expect(rels.get("rId2")).toBe("ppt/media/image1.png");
  });

  it("handles absolute paths without modification", () => {
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://example.com" Target="https://example.com/image.png"/>
    </Relationships>`;

    const rels = parseRelationships(relsXml);

    expect(rels.get("rId1")).toBe("https://example.com/image.png");
  });

  it("returns empty map for empty rels", () => {
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    </Relationships>`;

    const rels = parseRelationships(relsXml);

    expect(rels.size).toBe(0);
  });
});

describe("parseThemeColors", () => {
  it("extracts scheme colors from theme XML with srgbClr", () => {
    const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:themeElements>
        <a:clrScheme name="Office">
          <a:dk1><a:srgbClr val="000000"/></a:dk1>
          <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
          <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
          <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
        </a:clrScheme>
      </a:themeElements>
    </a:theme>`;

    const colors = parseThemeColors(themeXml);

    expect(colors.get("dk1")).toBe("#000000");
    expect(colors.get("dk2")).toBe("#1F497D");
    expect(colors.get("lt1")).toBe("#FFFFFF");
    expect(colors.get("accent1")).toBe("#4F81BD");
  });

  it("extracts system colors via lastClr attribute", () => {
    const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:themeElements>
        <a:clrScheme name="Office">
          <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
          <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
        </a:clrScheme>
      </a:themeElements>
    </a:theme>`;

    const colors = parseThemeColors(themeXml);

    expect(colors.get("dk1")).toBe("#000000");
    expect(colors.get("lt1")).toBe("#FFFFFF");
  });

  it("returns empty map when no clrScheme found", () => {
    const themeXml = `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;

    expect(parseThemeColors(themeXml).size).toBe(0);
  });
});

describe("extractSolidFill", () => {
  it("extracts hex color from a:srgbClr", () => {
    const nodes = parseXml(
      `<a:solidFill><a:srgbClr val="FF5733"/></a:solidFill>`,
    );

    const fill = extractSolidFill(nodes);

    expect(fill).toEqual({ type: "solid", color: "#FF5733" });
  });

  it("returns undefined when no solidFill present", () => {
    const nodes = parseXml(`<a:noFill/>`);

    expect(extractSolidFill(nodes)).toBeUndefined();
  });

  it("returns undefined for scheme colors without theme map", () => {
    const nodes = parseXml(
      `<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>`,
    );

    expect(extractSolidFill(nodes)).toBeUndefined();
  });

  it("resolves scheme colors when theme colors are provided", () => {
    const nodes = parseXml(
      `<a:solidFill><a:schemeClr val="dk2"/></a:solidFill>`,
    );
    const themeColors = new Map([["dk2", "#1F497D"]]);

    const fill = extractSolidFill(nodes, themeColors);

    expect(fill).toEqual({ type: "solid", color: "#1F497D" });
  });
});

describe("extractImageRef", () => {
  it("resolves rId through a:blipFill (drawingml namespace)", () => {
    const nodes = parseXml(
      `<a:blipFill><a:blip r:embed="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></a:blipFill>`,
    );
    const rels = new Map([["rId2", "ppt/media/image1.png"]]);

    const ref = extractImageRef(nodes, rels);

    expect(ref).toEqual({
      mediaPath: "ppt/media/image1.png",
      contentType: "image/png",
    });
  });

  it("resolves rId through p:blipFill (presentationml namespace)", () => {
    const nodes = parseXml(
      `<p:blipFill xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:blip r:embed="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></p:blipFill>`,
    );
    const rels = new Map([["rId3", "ppt/media/photo.jpg"]]);

    const ref = extractImageRef(nodes, rels);

    expect(ref).toEqual({
      mediaPath: "ppt/media/photo.jpg",
      contentType: "image/jpeg",
    });
  });

  it("returns undefined when no blipFill present", () => {
    const nodes = parseXml(
      `<a:solidFill><a:srgbClr val="000000"/></a:solidFill>`,
    );

    expect(extractImageRef(nodes, new Map())).toBeUndefined();
  });

  it("returns undefined when rId is not in relationships", () => {
    const nodes = parseXml(
      `<a:blipFill><a:blip r:embed="rId99" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></a:blipFill>`,
    );

    expect(extractImageRef(nodes, new Map())).toBeUndefined();
  });
});

describe("extractFontStyle", () => {
  it("extracts font size, bold, and italic", () => {
    const nodes = parseXml(
      `<a:p><a:r><a:rPr sz="2400" b="1" i="1"/><a:t>Bold italic</a:t></a:r></a:p>`,
    );
    // extractFontStyle expects the children of a:p
    const paragraphNodes = nodes[0]["a:p"];

    const style = extractFontStyle(paragraphNodes);

    expect(style).toEqual({
      sizePoints: 24,
      bold: true,
      italic: true,
    });
  });

  it("extracts text color from a:rPr > a:solidFill", () => {
    const nodes = parseXml(
      `<a:p><a:r><a:rPr sz="1800"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>Red</a:t></a:r></a:p>`,
    );
    const paragraphNodes = nodes[0]["a:p"];

    const style = extractFontStyle(paragraphNodes);

    expect(style?.sizePoints).toBe(18);
    expect(style?.color).toBe("#FF0000");
  });

  it("returns undefined when no a:rPr present", () => {
    const nodes = parseXml(`<a:p><a:r><a:t>Plain text</a:t></a:r></a:p>`);
    const paragraphNodes = nodes[0]["a:p"];

    expect(extractFontStyle(paragraphNodes)).toBeUndefined();
  });

  it("returns undefined when a:rPr has no relevant attributes", () => {
    const nodes = parseXml(
      `<a:p><a:r><a:rPr lang="en-US"/><a:t>Just language</a:t></a:r></a:p>`,
    );
    const paragraphNodes = nodes[0]["a:p"];

    expect(extractFontStyle(paragraphNodes)).toBeUndefined();
  });
});

describe("extractSlideBackground", () => {
  it("extracts solid fill background", () => {
    const nodes = parseXml(`
      <p:cSld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:bg>
          <p:bgPr>
            <a:solidFill><a:srgbClr val="003366"/></a:solidFill>
          </p:bgPr>
        </p:bg>
      </p:cSld>
    `);

    const bg = extractSlideBackground(nodes, new Map());

    expect(bg?.fill).toEqual({ type: "solid", color: "#003366" });
  });

  it("extracts image background", () => {
    const nodes = parseXml(`
      <p:cSld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:bg>
          <p:bgPr>
            <a:blipFill>
              <a:blip r:embed="rId5"/>
            </a:blipFill>
          </p:bgPr>
        </p:bg>
      </p:cSld>
    `);
    const rels = new Map([["rId5", "ppt/media/bg.jpg"]]);

    const bg = extractSlideBackground(nodes, rels);

    expect(bg?.image).toEqual({
      mediaPath: "ppt/media/bg.jpg",
      contentType: "image/jpeg",
    });
  });

  it("extracts background from p:bgRef with scheme color", () => {
    const nodes = parseXml(`
      <p:cSld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:bg>
          <p:bgRef idx="1001">
            <a:schemeClr val="dk2"/>
          </p:bgRef>
        </p:bg>
      </p:cSld>
    `);
    const themeColors = new Map([["dk2", "#1B2A4A"]]);

    const bg = extractSlideBackground(nodes, new Map(), themeColors);

    expect(bg?.fill).toEqual({ type: "solid", color: "#1B2A4A" });
  });

  it("resolves scheme color background with theme colors", () => {
    const nodes = parseXml(`
      <p:cSld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:bg>
          <p:bgPr>
            <a:solidFill><a:schemeClr val="dk2"/></a:solidFill>
          </p:bgPr>
        </p:bg>
      </p:cSld>
    `);
    const themeColors = new Map([["dk2", "#1B2A4A"]]);

    const bg = extractSlideBackground(nodes, new Map(), themeColors);

    expect(bg?.fill).toEqual({ type: "solid", color: "#1B2A4A" });
  });

  it("returns undefined when no background", () => {
    const nodes = parseXml(`
      <p:cSld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree/>
      </p:cSld>
    `);

    expect(extractSlideBackground(nodes, new Map())).toBeUndefined();
  });
});

// --- Updated existing layout tests ---

const layoutSlideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
          <a:p><a:r><a:t>Title text</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:spPr>
          <a:xfrm>
            <a:off x="838200" y="1825625"/>
            <a:ext cx="10515600" cy="4351338"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:r><a:t>Body text</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

describe("extractSlideLayout", () => {
  it("extracts regions with positions from shapes with a:xfrm", () => {
    const { regions } = extractSlideLayout(layoutSlideXml, 0);

    expect(regions).toHaveLength(2);
    expect(regions[0].segmentId).toBe("pptx-s0-p0");
    expect(regions[0].x).toBeGreaterThan(0);
    expect(regions[0].width).toBeGreaterThan(0);
    expect(regions[1].segmentId).toBe("pptx-s0-p1");
  });

  it("provides fallback positions for shapes without a:xfrm", () => {
    const { regions } = extractSlideLayout(slideXml, 0);

    expect(regions).toHaveLength(3);
    expect(regions[0].segmentId).toBe("pptx-s0-p0");
    expect(regions[0].x).toBe(50);
  });

  it("segment IDs match extractTextFromSlideXml", () => {
    const segments = extractTextFromSlideXml(layoutSlideXml, 0);
    const { regions } = extractSlideLayout(layoutSlideXml, 0);

    expect(regions.map((r) => r.segmentId)).toEqual(segments.map((s) => s.id));
  });

  it("assigns zIndex from shape iteration order", () => {
    const { regions } = extractSlideLayout(layoutSlideXml, 0);

    expect(regions[0].zIndex).toBe(1);
    expect(regions[1].zIndex).toBe(2);
  });

  it("extracts visual shapes without text", () => {
    const xmlWithColoredShape = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="9525000" cy="9525000"/>
              </a:xfrm>
              <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
            </p:spPr>
          </p:sp>
          <p:sp>
            <p:txBody>
              <a:p><a:r><a:t>Text</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { regions, shapes } = extractSlideLayout(xmlWithColoredShape, 0);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].fill).toEqual({ type: "solid", color: "#FF0000" });
    expect(shapes[0].x).toBe(0);
    expect(shapes[0].width).toBe(1000);
    expect(regions).toHaveLength(1);
  });

  it("extracts p:pic elements as visual shapes with image references", () => {
    const xmlWithPic = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:cSld>
        <p:spTree>
          <p:pic>
            <p:spPr>
              <a:xfrm>
                <a:off x="952500" y="952500"/>
                <a:ext cx="4762500" cy="4762500"/>
              </a:xfrm>
            </p:spPr>
            <p:blipFill>
              <a:blip r:embed="rId2"/>
            </p:blipFill>
          </p:pic>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const rels = new Map([["rId2", "ppt/media/photo.png"]]);
    const { shapes } = extractSlideLayout(xmlWithPic, 0, rels);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].image).toEqual({
      mediaPath: "ppt/media/photo.png",
      contentType: "image/png",
    });
    expect(shapes[0].x).toBe(100);
  });

  it("extracts font style from text regions", () => {
    const xmlWithFont = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="9525000" cy="952500"/>
              </a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:p>
                <a:r>
                  <a:rPr sz="3200" b="1"/>
                  <a:t>Big Bold</a:t>
                </a:r>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { regions } = extractSlideLayout(xmlWithFont, 0);

    expect(regions).toHaveLength(1);
    expect(regions[0].fontStyle).toEqual({ sizePoints: 32, bold: true });
  });
});

describe("extractLineColor", () => {
  it("extracts line color from a:ln with srgbClr", () => {
    const nodes = parseXml(`
      <p:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:ln w="12700">
          <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        </a:ln>
      </p:spPr>
    `);

    const fill = extractLineColor(nodes);

    expect(fill).toEqual({ type: "solid", color: "#FFFFFF" });
  });

  it("resolves line scheme color with theme colors", () => {
    const nodes = parseXml(`
      <p:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:ln>
          <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
        </a:ln>
      </p:spPr>
    `);
    const themeColors = new Map([["accent1", "#4F81BD"]]);

    const fill = extractLineColor(nodes, themeColors);

    expect(fill).toEqual({ type: "solid", color: "#4F81BD" });
  });

  it("falls back to p:style > a:lnRef > a:schemeClr", () => {
    const nodes = parseXml(`
      <root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="0"/></a:xfrm>
          <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
          <a:ln w="12700"/>
        </p:spPr>
        <p:style>
          <a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>
          <a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>
        </p:style>
      </root>
    `);
    // extractLineColor receives the children of the root element
    const children = nodes[0].root;
    const themeColors = new Map([["accent1", "#4F81BD"]]);

    const fill = extractLineColor(children, themeColors);

    expect(fill).toEqual({ type: "solid", color: "#4F81BD" });
  });

  it("prefers explicit a:ln color over style reference", () => {
    const nodes = parseXml(`
      <root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spPr>
          <a:ln w="12700">
            <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
          </a:ln>
        </p:spPr>
        <p:style>
          <a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>
        </p:style>
      </root>
    `);
    const children = nodes[0].root;
    const themeColors = new Map([["accent1", "#4F81BD"]]);

    const fill = extractLineColor(children, themeColors);

    expect(fill).toEqual({ type: "solid", color: "#FFFFFF" });
  });

  it("returns undefined when no line element or style", () => {
    const nodes = parseXml(`
      <p:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
      </p:spPr>
    `);

    expect(extractLineColor(nodes)).toBeUndefined();
  });
});

describe("extractSlideLayout - connector shapes", () => {
  it("extracts p:cxnSp connector shapes as visual shapes", () => {
    const xmlWithConnector = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:cxnSp>
            <p:spPr>
              <a:xfrm>
                <a:off x="457200" y="457200"/>
                <a:ext cx="8229600" cy="0"/>
              </a:xfrm>
              <a:ln w="12700">
                <a:solidFill><a:srgbClr val="C0C0C0"/></a:solidFill>
              </a:ln>
            </p:spPr>
          </p:cxnSp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { shapes } = extractSlideLayout(xmlWithConnector, 0);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].fill).toEqual({ type: "solid", color: "#C0C0C0" });
    expect(shapes[0].x).toBe(48);
    expect(shapes[0].height).toBe(1); // 0 height bumped to 1px
  });

  it("ignores connector shapes without line color", () => {
    const xmlWithEmptyConnector = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:cxnSp>
            <p:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="9525000" cy="0"/>
              </a:xfrm>
            </p:spPr>
          </p:cxnSp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { shapes } = extractSlideLayout(xmlWithEmptyConnector, 0);

    expect(shapes).toHaveLength(0);
  });
});

describe("extractSlideLayout - line-only shapes", () => {
  it("extracts p:sp shapes with only a:ln as visual shapes", () => {
    const xmlWithLineSeparator = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:spPr>
              <a:xfrm>
                <a:off x="457200" y="457200"/>
                <a:ext cx="11201400" cy="0"/>
              </a:xfrm>
              <a:ln w="6350">
                <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
              </a:ln>
            </p:spPr>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { shapes } = extractSlideLayout(xmlWithLineSeparator, 0);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].fill).toEqual({ type: "solid", color: "#FFFFFF" });
    expect(shapes[0].height).toBe(1);
  });

  it("extracts line preset shapes using line color instead of shape fill", () => {
    const xmlWithLinePreset = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:spPr>
              <a:xfrm>
                <a:off x="56676" y="99150"/>
                <a:ext cx="9024937" cy="0"/>
              </a:xfrm>
              <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
              <a:solidFill><a:srgbClr val="CF5E39"/></a:solidFill>
              <a:ln w="5292">
                <a:solidFill><a:srgbClr val="FBF8F5"/></a:solidFill>
              </a:ln>
            </p:spPr>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { shapes } = extractSlideLayout(xmlWithLinePreset, 0);

    expect(shapes).toHaveLength(1);
    // Line color (#FBF8F5) should be used, not shape fill (#CF5E39)
    expect(shapes[0].fill).toEqual({ type: "solid", color: "#FBF8F5" });
    expect(shapes[0].height).toBe(1);
    expect(shapes[0].width).toBe(947);
  });
});

describe("extractSlideLayout - normAutofit fontScale", () => {
  it("applies fontScale from a:normAutofit to reduce sizePoints", () => {
    const xmlWithAutofit = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:spPr>
              <a:xfrm>
                <a:off x="952500" y="952500"/>
                <a:ext cx="4762500" cy="1905000"/>
              </a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:bodyPr>
                <a:normAutofit fontScale="62500"/>
              </a:bodyPr>
              <a:p>
                <a:r>
                  <a:rPr sz="4800" b="1"/>
                  <a:t>Big text that needs shrinking</a:t>
                </a:r>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { regions } = extractSlideLayout(xmlWithAutofit, 0);

    expect(regions).toHaveLength(1);
    // 4800 hundredths = 48pt, scaled by 62500/100000 = 0.625 → 30pt
    expect(regions[0].fontStyle?.sizePoints).toBe(30);
  });

  it("leaves sizePoints unchanged when no normAutofit", () => {
    const xmlNoAutofit = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:spPr>
              <a:xfrm>
                <a:off x="952500" y="952500"/>
                <a:ext cx="4762500" cy="1905000"/>
              </a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:bodyPr/>
              <a:p>
                <a:r>
                  <a:rPr sz="4800" b="1"/>
                  <a:t>Normal text</a:t>
                </a:r>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const { regions } = extractSlideLayout(xmlNoAutofit, 0);

    expect(regions).toHaveLength(1);
    expect(regions[0].fontStyle?.sizePoints).toBe(48);
  });
});

describe("extractFontStyle - line spacing", () => {
  it("extracts percentage line spacing from a:lnSpc > a:spcPct", () => {
    const nodes = parseXml(`
      <a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:pPr algn="ctr">
          <a:lnSpc><a:spcPct val="90000"/></a:lnSpc>
        </a:pPr>
        <a:r>
          <a:rPr sz="4800" b="1"/>
          <a:t>Text</a:t>
        </a:r>
      </a:p>
    `);
    const paragraphNodes = nodes[0]["a:p"];

    const style = extractFontStyle(paragraphNodes);
    expect(style?.lineHeight).toBe(0.9);
    expect(style?.sizePoints).toBe(48);
    expect(style?.align).toBe("center");
  });

  it("extracts absolute line spacing from a:lnSpc > a:spcPts", () => {
    const nodes = parseXml(`
      <a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:pPr algn="ctr">
          <a:lnSpc><a:spcPts val="5100"/></a:lnSpc>
        </a:pPr>
        <a:r>
          <a:rPr sz="2400" b="1"/>
          <a:t>Text</a:t>
        </a:r>
      </a:p>
    `);
    const paragraphNodes = nodes[0]["a:p"];

    const style = extractFontStyle(paragraphNodes);
    // 5100 hundredths of pt = 51pt, font is 24pt → ratio = 51/24 = 2.125
    expect(style?.lineSpacingPoints).toBe(51);
    expect(style?.sizePoints).toBe(24);
  });

  it("does not set lineHeight when no a:lnSpc present", () => {
    const nodes = parseXml(`
      <a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:r>
          <a:rPr sz="2400"/>
          <a:t>Text</a:t>
        </a:r>
      </a:p>
    `);
    const paragraphNodes = nodes[0]["a:p"];

    const style = extractFontStyle(paragraphNodes);
    expect(style?.lineHeight).toBeUndefined();
    expect(style?.lineSpacingPoints).toBeUndefined();
  });
});

describe("extractPptxLayout - background inheritance", () => {
  it("inherits background from slide layout when slide has none", () => {
    const encoder = new TextEncoder();

    const slideXmlNoBg = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>Text</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const layoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:bg>
          <p:bgPr>
            <a:solidFill><a:srgbClr val="2D1B4E"/></a:solidFill>
          </p:bgPr>
        </p:bg>
      </p:cSld>
    </p:sldLayout>`;

    const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
    </Relationships>`;

    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideXmlNoBg),
      "ppt/slides/_rels/slide1.xml.rels": encoder.encode(slideRels),
      "ppt/slideLayouts/slideLayout1.xml": encoder.encode(layoutXml),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts } = extractPptxLayout(zipped);

    expect(layouts[0].background?.fill).toEqual({
      type: "solid",
      color: "#2D1B4E",
    });
  });

  it("inherits background from slide master when layout has none", () => {
    const encoder = new TextEncoder();

    const slideXmlNoBg = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody><a:p><a:r><a:t>Text</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`;

    const layoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree/></p:cSld>
    </p:sldLayout>`;

    const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:bg>
          <p:bgPr>
            <a:solidFill><a:srgbClr val="1A0A3E"/></a:solidFill>
          </p:bgPr>
        </p:bg>
      </p:cSld>
    </p:sldMaster>`;

    const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
    </Relationships>`;

    const layoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
    </Relationships>`;

    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideXmlNoBg),
      "ppt/slides/_rels/slide1.xml.rels": encoder.encode(slideRels),
      "ppt/slideLayouts/slideLayout1.xml": encoder.encode(layoutXml),
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels":
        encoder.encode(layoutRels),
      "ppt/slideMasters/slideMaster1.xml": encoder.encode(masterXml),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts } = extractPptxLayout(zipped);

    expect(layouts[0].background?.fill).toEqual({
      type: "solid",
      color: "#1A0A3E",
    });
  });

  it("uses slide background when present (no inheritance)", () => {
    const encoder = new TextEncoder();

    const slideWithBg = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:bg><p:bgPr>
          <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
        </p:bgPr></p:bg>
        <p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>Text</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideWithBg),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts } = extractPptxLayout(zipped);

    expect(layouts[0].background?.fill).toEqual({
      type: "solid",
      color: "#FF0000",
    });
  });
});

describe("extractPptxLayout", () => {
  it("extracts layouts from a zipped PPTX with slide dimensions", () => {
    const encoder = new TextEncoder();
    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/presentation.xml": encoder.encode(
        `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
      ),
      "ppt/slides/slide1.xml": encoder.encode(layoutSlideXml),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts } = extractPptxLayout(zipped);

    expect(layouts).toHaveLength(1);
    expect(layouts[0].slideIndex).toBe(0);
    expect(layouts[0].width).toBe(1280);
    expect(layouts[0].height).toBe(720);
    expect(layouts[0].regions).toHaveLength(2);
  });

  it("returns regions for shapes without position data", () => {
    const encoder = new TextEncoder();
    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideXml),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts } = extractPptxLayout(zipped);

    expect(layouts).toHaveLength(1);
    expect(layouts[0].regions).toHaveLength(3);
    expect(layouts[0].regions[0].segmentId).toBe("pptx-s0-p0");
  });

  it("parses slide relationships and collects media paths", () => {
    const encoder = new TextEncoder();
    const slideWithImage = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:cSld>
        <p:spTree>
          <p:pic>
            <p:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="9525000" cy="9525000"/></a:xfrm>
            </p:spPr>
            <a:blipFill><a:blip r:embed="rId2"/></a:blipFill>
          </p:pic>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
    </Relationships>`;

    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideWithImage),
      "ppt/slides/_rels/slide1.xml.rels": encoder.encode(relsXml),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts, mediaPaths } = extractPptxLayout(zipped);

    expect(layouts[0].shapes).toHaveLength(1);
    expect(layouts[0].shapes[0].image?.mediaPath).toBe("ppt/media/image1.png");
    expect(mediaPaths).toContain("ppt/media/image1.png");
  });
});

describe("parseMasterTextStyles", () => {
  it("extracts title, body, and other font sizes and alignment", () => {
    const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:txStyles>
        <p:titleStyle>
          <a:lvl1pPr algn="ctr">
            <a:defRPr sz="4400"/>
          </a:lvl1pPr>
        </p:titleStyle>
        <p:bodyStyle>
          <a:lvl1pPr algn="l">
            <a:defRPr sz="2800"/>
          </a:lvl1pPr>
        </p:bodyStyle>
        <p:otherStyle>
          <a:lvl1pPr>
            <a:defRPr sz="1800"/>
          </a:lvl1pPr>
        </p:otherStyle>
      </p:txStyles>
    </p:sldMaster>`;

    const styles = parseMasterTextStyles(masterXml);

    expect(styles.title?.size).toBe(44);
    expect(styles.title?.align).toBe("center");
    expect(styles.body?.size).toBe(28);
    expect(styles.body?.align).toBe("left");
    expect(styles.other?.size).toBe(18);
  });
});

describe("extractFontStyle - alignment", () => {
  it("extracts paragraph alignment from a:pPr", () => {
    const nodes = parseXml(
      `<a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="2400"/><a:t>Centered</a:t></a:r></a:p>`,
    );
    const paragraphNodes = nodes[0]["a:p"];

    const style = extractFontStyle(paragraphNodes);

    expect(style?.align).toBe("center");
    expect(style?.sizePoints).toBe(24);
  });
});

describe("extractPptxLayout - master font inheritance", () => {
  it("applies master title style to ctrTitle placeholder shapes", () => {
    const encoder = new TextEncoder();

    const slideXmlWithPlaceholder = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="2" name="Title 1"/>
            <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
            <p:nvPr><p:ph type="ctrTitle"/></p:nvPr>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="2743200"/></a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:bodyPr/><a:lstStyle/>
            <a:p><a:r><a:t>Title Text</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree></p:cSld>
    </p:sld>`;

    const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree/></p:cSld>
      <p:txStyles>
        <p:titleStyle>
          <a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr>
        </p:titleStyle>
        <p:bodyStyle>
          <a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr>
        </p:bodyStyle>
        <p:otherStyle>
          <a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr>
        </p:otherStyle>
      </p:txStyles>
    </p:sldMaster>`;

    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideXmlWithPlaceholder),
      "ppt/slideMasters/slideMaster1.xml": encoder.encode(masterXml),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts } = extractPptxLayout(zipped);

    expect(layouts[0].regions).toHaveLength(1);
    expect(layouts[0].regions[0].fontStyle?.sizePoints).toBe(44);
    expect(layouts[0].regions[0].fontStyle?.align).toBe("center");
  });

  it("applies otherStyle to non-placeholder text shapes", () => {
    const encoder = new TextEncoder();

    const slideXmlNoPlaceholder = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="5" name="TextBox 4"/>
            <p:cNvSpPr txBox="1"/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="952500"/></a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:bodyPr/><a:lstStyle/>
            <a:p><a:r><a:t>Plain text</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree></p:cSld>
    </p:sld>`;

    const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree/></p:cSld>
      <p:txStyles>
        <p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>
        <p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle>
        <p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>
      </p:txStyles>
    </p:sldMaster>`;

    const pptxFiles: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": encoder.encode(slideXmlNoPlaceholder),
      "ppt/slideMasters/slideMaster1.xml": encoder.encode(masterXml),
    };
    const zipped = zipSync(pptxFiles);

    const { layouts } = extractPptxLayout(zipped);

    expect(layouts[0].regions).toHaveLength(1);
    expect(layouts[0].regions[0].fontStyle?.sizePoints).toBe(18);
  });
});

describe("extractLayoutPlaceholderPositions - font style", () => {
  it("extracts font style from layout placeholder shapes using a:defRPr", () => {
    const layoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="2" name="Title 1"/>
              <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
              <p:nvPr><p:ph type="ctrTitle"/></p:nvPr>
            </p:nvSpPr>
            <p:spPr>
              <a:xfrm>
                <a:off x="952500" y="952500"/>
                <a:ext cx="7620000" cy="2667000"/>
              </a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:bodyPr/>
              <a:p>
                <a:pPr algn="ctr">
                  <a:defRPr sz="4400"/>
                </a:pPr>
                <a:endParaRPr lang="en-US"/>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sldLayout>`;

    const positions = extractLayoutPlaceholderPositions(layoutXml);
    const ctrTitle = positions.get("ctrTitle");

    expect(ctrTitle).toBeDefined();
    expect(ctrTitle?.fontStyle?.align).toBe("center");
    expect(ctrTitle?.fontStyle?.sizePoints).toBe(44);
  });
});

describe("extractSlideLayout - layout font style fallback", () => {
  it("uses layout placeholder font style when shape has no style", () => {
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="2" name="Title 1"/>
              <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
              <p:nvPr><p:ph type="ctrTitle"/></p:nvPr>
            </p:nvSpPr>
            <p:spPr>
              <a:xfrm>
                <a:off x="952500" y="952500"/>
                <a:ext cx="7620000" cy="2667000"/>
              </a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:bodyPr/>
              <a:p>
                <a:r><a:rPr lang="en-US"/><a:t>My Title</a:t></a:r>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;

    const layoutPositions =
      extractLayoutPlaceholderPositions(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="2" name="Title 1"/>
              <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
              <p:nvPr><p:ph type="ctrTitle"/></p:nvPr>
            </p:nvSpPr>
            <p:spPr>
              <a:xfrm>
                <a:off x="952500" y="952500"/>
                <a:ext cx="7620000" cy="2667000"/>
              </a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:bodyPr/>
              <a:p>
                <a:pPr algn="ctr">
                  <a:defRPr sz="4400"/>
                </a:pPr>
                <a:endParaRPr lang="en-US"/>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sldLayout>`);

    const { regions } = extractSlideLayout(
      slideXml,
      0,
      undefined,
      undefined,
      undefined,
      layoutPositions,
    );

    expect(regions).toHaveLength(1);
    // Shape has no align/size, should fall back to layout's center/44pt
    expect(regions[0].fontStyle?.align).toBe("center");
    expect(regions[0].fontStyle?.sizePoints).toBe(44);
  });
});
