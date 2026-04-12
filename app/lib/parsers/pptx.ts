import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { unzipSync, zipSync } from "fflate";
import { distributeTextAcrossRuns } from "../distribute-text";

const parserOptions = {
  ignoreAttributes: false,
  preserveOrder: true,
  trimValues: false,
};

const parser = new XMLParser(parserOptions);
const builder = new XMLBuilder(parserOptions);

export interface ExtractedSegment {
  id: string;
  source: string;
  slideIndex: number;
  xmlPath: string;
}

export interface ShapeFill {
  type: "solid";
  color: string; // "#RRGGBB"
  opacity?: number; // 0-1, defaults to 1
}

export interface ImageReference {
  mediaPath: string; // "ppt/media/image1.png"
  contentType: string;
}

export interface VisualShape {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: ShapeFill;
  image?: ImageReference;
  zIndex: number;
  source?: "slide" | "layout";
}

export interface SlideBackground {
  fill?: ShapeFill;
  image?: ImageReference;
}

export interface FontStyle {
  sizePoints?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  lineSpacingPoints?: number;
}

export interface TextRegion {
  segmentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontStyle?: FontStyle;
  zIndex: number;
}

export interface SlideLayout {
  slideIndex: number;
  width: number;
  height: number;
  regions: TextRegion[];
  shapes: VisualShape[];
  background?: SlideBackground;
  defaultTextColor?: string;
}

export interface SlideImageData {
  mediaPath: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface MasterTextStyleEntry {
  size?: number; // points
  align?: "left" | "center" | "right";
  lineHeight?: number; // ratio (from a:spcPct)
  lineSpacingPoints?: number; // absolute (from a:spcPts)
}

export interface MasterTextStyles {
  title?: MasterTextStyleEntry;
  body?: MasterTextStyleEntry;
  other?: MasterTextStyleEntry;
}

const EMU_PER_PX = 9525;

function emuToPx(emu: number): number {
  return Math.round(emu / EMU_PER_PX);
}

function isColorDark(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = Number.parseInt(c.slice(0, 2), 16);
  const g = Number.parseInt(c.slice(2, 4), 16);
  const b = Number.parseInt(c.slice(4, 6), 16);
  // Relative luminance threshold
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// biome-ignore lint/suspicious/noExplicitAny: fast-xml-parser preserveOrder returns untyped nodes
type XmlNode = any;

/**
 * Recursively walk an XML tree (preserveOrder format) and collect
 * all text content from <a:t> elements, grouped by paragraph (<a:p>).
 */
export function extractTextFromSlideXml(
  xml: string,
  slideIndex: number,
): ExtractedSegment[] {
  const parsed = parser.parse(xml);
  const segments: ExtractedSegment[] = [];
  const paragraphs: { text: string; path: string }[] = [];

  function collectParagraphs(nodes: XmlNode[], path: string) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;

        if (key === "a:p") {
          // Collect all <a:t> text within this paragraph
          const runs = node[key];
          const texts: string[] = [];
          collectTextRuns(runs, texts);
          const text = texts.join("").trim();
          if (text) {
            paragraphs.push({ text, path: `${path}/a:p` });
          }
        } else if (Array.isArray(node[key])) {
          collectParagraphs(node[key], `${path}/${key}`);
        }
      }
    }
  }

  function collectTextRuns(nodes: XmlNode[], texts: string[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@") continue;
        if (key === "a:t") {
          for (const textNode of node[key]) {
            if ("#text" in textNode) {
              texts.push(String(textNode["#text"]));
            }
          }
        } else if (Array.isArray(node[key])) {
          collectTextRuns(node[key], texts);
        }
      }
    }
  }

  collectParagraphs(parsed, "");

  for (let i = 0; i < paragraphs.length; i++) {
    segments.push({
      id: `pptx-s${slideIndex}-p${i}`,
      source: paragraphs[i].text,
      slideIndex,
      xmlPath: paragraphs[i].path,
    });
  }

  return segments;
}

export function extractSegments(data: Uint8Array): ExtractedSegment[] {
  const files = unzipSync(data);
  const segments: ExtractedSegment[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (!path.match(/^ppt\/slides\/slide\d+\.xml$/)) continue;

    const xml = new TextDecoder().decode(content);
    const slideIndex = Number(path.match(/slide(\d+)/)?.[1]) - 1;
    segments.push(...extractTextFromSlideXml(xml, slideIndex));
  }

  return segments;
}

export function replaceTextInSlideXml(
  xml: string,
  translations: Map<string, string>,
  slideIndex: number,
): string {
  const parsed = parser.parse(xml);
  let paragraphIndex = 0;

  function walkAndReplace(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;

        if (key === "a:p") {
          const runs = node[key];
          const texts: string[] = [];
          collectTextsForCount(runs, texts);
          const original = texts.join("").trim();

          if (original) {
            const id = `pptx-s${slideIndex}-p${paragraphIndex}`;
            const translation = translations.get(id);
            if (translation) {
              replaceTextInRuns(runs, translation);
            }
            paragraphIndex++;
          }
        } else if (Array.isArray(node[key])) {
          walkAndReplace(node[key]);
        }
      }
    }
  }

  function collectTextsForCount(nodes: XmlNode[], texts: string[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@") continue;
        if (key === "a:t") {
          for (const textNode of node[key]) {
            if ("#text" in textNode) {
              texts.push(String(textNode["#text"]));
            }
          }
        } else if (Array.isArray(node[key])) {
          collectTextsForCount(node[key], texts);
        }
      }
    }
  }

  function collectTextNodes(
    nodes: XmlNode[],
    textNodes: { node: XmlNode; length: number }[],
  ) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@") continue;
        if (key === "a:t") {
          for (const textNode of node[key]) {
            if ("#text" in textNode) {
              textNodes.push({
                node: textNode,
                length: String(textNode["#text"]).length,
              });
            }
          }
        } else if (Array.isArray(node[key])) {
          collectTextNodes(node[key], textNodes);
        }
      }
    }
  }

  function replaceTextInRuns(nodes: XmlNode[], translation: string) {
    const textNodes: { node: XmlNode; length: number }[] = [];
    collectTextNodes(nodes, textNodes);

    const lengths = textNodes.map((entry) => entry.length);
    const distributed = distributeTextAcrossRuns(lengths, translation);

    for (let index = 0; index < textNodes.length; index++) {
      textNodes[index].node["#text"] = distributed[index];
    }
  }

  walkAndReplace(parsed);
  return builder.build(parsed);
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
  tiff: "image/tiff",
  tif: "image/tiff",
  bmp: "image/bmp",
};

// Scheme color element names in a:clrScheme that map to a:schemeClr val attributes.
// PowerPoint uses shorthand names like "dk1" in the theme but references like "dk1" in schemeClr.
const SCHEME_CLR_ELEMENTS = [
  "a:dk1",
  "a:dk2",
  "a:lt1",
  "a:lt2",
  "a:accent1",
  "a:accent2",
  "a:accent3",
  "a:accent4",
  "a:accent5",
  "a:accent6",
  "a:hlink",
  "a:folHlink",
];

export function parseThemeColors(themeXml: string): Map<string, string> {
  const colors = new Map<string, string>();
  const parsed = parser.parse(themeXml);

  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@") continue;
        if (key === "a:clrScheme") {
          extractSchemeColors(node[key]);
          return;
        }
        if (Array.isArray(node[key])) {
          walk(node[key]);
        }
      }
    }
  }

  function extractSchemeColors(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (!SCHEME_CLR_ELEMENTS.includes(key)) continue;
        // Strip "a:" prefix to get the scheme name (e.g. "dk1", "accent1")
        const schemeName = key.slice(2);
        for (const colorNode of node[key]) {
          if ("a:srgbClr" in colorNode) {
            const val = colorNode[":@"]?.["@_val"];
            if (val) colors.set(schemeName, `#${val}`);
          } else if ("a:sysClr" in colorNode) {
            const val = colorNode[":@"]?.["@_lastClr"];
            if (val) colors.set(schemeName, `#${val}`);
          }
        }
      }
    }
  }

  walk(parsed);
  return colors;
}

export function parseMasterTextStyles(masterXml: string): MasterTextStyles {
  const parsed = parser.parse(masterXml);
  const styles: MasterTextStyles = {};

  function extractStyleEntry(
    styleNodes: XmlNode[],
  ): MasterTextStyleEntry | undefined {
    for (const node of styleNodes) {
      if ("a:lvl1pPr" in node) {
        const entry: MasterTextStyleEntry = {};
        const algn = node[":@"]?.["@_algn"];
        if (algn === "ctr") entry.align = "center";
        else if (algn === "r") entry.align = "right";
        else if (algn === "l") entry.align = "left";

        for (const child of node["a:lvl1pPr"]) {
          if ("a:defRPr" in child) {
            const sz = child[":@"]?.["@_sz"];
            if (sz != null) entry.size = Number(sz) / 100;
          }
          if ("a:lnSpc" in child) {
            for (const lnSpcChild of child["a:lnSpc"]) {
              if ("a:spcPct" in lnSpcChild) {
                const val = lnSpcChild[":@"]?.["@_val"];
                if (val) entry.lineHeight = Number(val) / 100000;
              }
              if ("a:spcPts" in lnSpcChild) {
                const val = lnSpcChild[":@"]?.["@_val"];
                if (val) entry.lineSpacingPoints = Number(val) / 100;
              }
            }
          }
        }
        if (
          entry.size != null ||
          entry.align != null ||
          entry.lineHeight != null ||
          entry.lineSpacingPoints != null
        )
          return entry;
      }
    }
    return undefined;
  }

  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@") continue;
        if (key === "p:txStyles") {
          for (const styleNode of node[key]) {
            if ("p:titleStyle" in styleNode) {
              styles.title = extractStyleEntry(styleNode["p:titleStyle"]);
            }
            if ("p:bodyStyle" in styleNode) {
              styles.body = extractStyleEntry(styleNode["p:bodyStyle"]);
            }
            if ("p:otherStyle" in styleNode) {
              styles.other = extractStyleEntry(styleNode["p:otherStyle"]);
            }
          }
          return;
        }
        if (Array.isArray(node[key])) {
          walk(node[key]);
        }
      }
    }
  }

  walk(parsed);
  return styles;
}

export function parseRelationships(relsXml: string): Map<string, string> {
  const relationships = new Map<string, string>();
  const parsed = parser.parse(relsXml);

  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@") continue;
        if (key === "Relationship") {
          const attrs = node[":@"];
          if (attrs?.["@_Id"] && attrs?.["@_Target"]) {
            const target = String(attrs["@_Target"]);
            // Resolve relative paths: ../media/image1.png -> ppt/media/image1.png
            const resolved = target.startsWith("../")
              ? `ppt/${target.slice(3)}`
              : target;
            relationships.set(String(attrs["@_Id"]), resolved);
          }
        } else if (Array.isArray(node[key])) {
          walk(node[key]);
        }
      }
    }
  }

  walk(parsed);
  return relationships;
}

function extractAlpha(colorChildren: XmlNode[]): number | undefined {
  if (!colorChildren) return undefined;
  for (const child of colorChildren) {
    if ("a:alpha" in child) {
      const val = child[":@"]?.["@_val"];
      if (val != null) return Number(val) / 100000;
    }
  }
  return undefined;
}

export function extractSolidFill(
  nodes: XmlNode[],
  themeColors?: Map<string, string>,
): ShapeFill | undefined {
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      if (key === "a:solidFill") {
        for (const fillChild of node[key]) {
          if ("a:srgbClr" in fillChild) {
            const color = fillChild[":@"]?.["@_val"];
            if (color) {
              const alpha = extractAlpha(fillChild["a:srgbClr"]);
              return {
                type: "solid",
                color: `#${color}`,
                ...(alpha != null && { opacity: alpha }),
              };
            }
          }
          if ("a:schemeClr" in fillChild && themeColors) {
            const schemeName = fillChild[":@"]?.["@_val"];
            if (schemeName) {
              const color = themeColors.get(schemeName);
              if (color) {
                const alpha = extractAlpha(fillChild["a:schemeClr"]);
                return {
                  type: "solid",
                  color,
                  ...(alpha != null && { opacity: alpha }),
                };
              }
            }
          }
        }
        return undefined;
      }
      if (Array.isArray(node[key]) && key !== "#text") {
        const result = extractSolidFill(node[key], themeColors);
        if (result) return result;
      }
    }
  }
  return undefined;
}

export function extractImageRef(
  nodes: XmlNode[],
  relationships: Map<string, string>,
): ImageReference | undefined {
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      // Pictures use p:blipFill, backgrounds and shapes use a:blipFill
      if (key === "a:blipFill" || key === "p:blipFill") {
        for (const fillChild of node[key]) {
          if ("a:blip" in fillChild) {
            const embedId = fillChild[":@"]?.["@_r:embed"];
            if (embedId) {
              const mediaPath = relationships.get(embedId);
              if (mediaPath) {
                const extension =
                  mediaPath.split(".").pop()?.toLowerCase() ?? "";
                return {
                  mediaPath,
                  contentType:
                    CONTENT_TYPES[extension] ?? "application/octet-stream",
                };
              }
            }
          }
        }
        return undefined;
      }
      if (Array.isArray(node[key]) && key !== "#text") {
        const result = extractImageRef(node[key], relationships);
        if (result) return result;
      }
    }
  }
  return undefined;
}

export function extractFontStyle(
  paragraphNodes: XmlNode[],
  themeColors?: Map<string, string>,
): FontStyle | undefined {
  // First check paragraph-level properties from a:pPr
  let align: "left" | "center" | "right" | undefined;
  let lineHeight: number | undefined;
  let lineSpacingPoints: number | undefined;
  let defRPrSize: number | undefined;
  for (const node of paragraphNodes) {
    if ("a:pPr" in node) {
      const algn = node[":@"]?.["@_algn"];
      if (algn === "ctr") align = "center";
      else if (algn === "r") align = "right";
      else if (algn === "l") align = "left";

      for (const pprChild of node["a:pPr"]) {
        if ("a:lnSpc" in pprChild) {
          for (const lnSpcChild of pprChild["a:lnSpc"]) {
            if ("a:spcPct" in lnSpcChild) {
              const val = lnSpcChild[":@"]?.["@_val"];
              if (val) {
                lineHeight = Number(val) / 100000;
              }
            }
            if ("a:spcPts" in lnSpcChild) {
              const val = lnSpcChild[":@"]?.["@_val"];
              if (val) {
                lineSpacingPoints = Number(val) / 100;
              }
            }
          }
        }
        // Read default run properties (used by layout/master placeholders)
        if ("a:defRPr" in pprChild) {
          const defAttrs = pprChild[":@"] ?? {};
          if (defAttrs["@_sz"] != null) {
            defRPrSize = Number(defAttrs["@_sz"]) / 100;
          }
        }
      }
    }
  }

  for (const node of paragraphNodes) {
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      if (key === "a:r") {
        // Look at first run's properties
        for (const runChild of node[key]) {
          if ("a:rPr" in runChild) {
            const attrs = runChild[":@"] ?? {};
            const style: FontStyle = {};
            let hasProperty = false;

            if (align) {
              style.align = align;
              hasProperty = true;
            }

            if (lineHeight != null) {
              style.lineHeight = lineHeight;
              hasProperty = true;
            }

            if (lineSpacingPoints != null) {
              style.lineSpacingPoints = lineSpacingPoints;
              hasProperty = true;
            }

            if (attrs["@_sz"] != null) {
              style.sizePoints = Number(attrs["@_sz"]) / 100;
              hasProperty = true;
            } else if (defRPrSize != null) {
              style.sizePoints = defRPrSize;
              hasProperty = true;
            }
            if (attrs["@_b"] === "1" || attrs["@_b"] === true) {
              style.bold = true;
              hasProperty = true;
            }
            if (attrs["@_i"] === "1" || attrs["@_i"] === true) {
              style.italic = true;
              hasProperty = true;
            }

            // Check for text color
            for (const rPrChild of runChild["a:rPr"]) {
              if ("a:solidFill" in rPrChild) {
                for (const fillChild of rPrChild["a:solidFill"]) {
                  if ("a:srgbClr" in fillChild) {
                    const color = fillChild[":@"]?.["@_val"];
                    if (color) {
                      style.color = `#${color}`;
                      hasProperty = true;
                    }
                  }
                  if ("a:schemeClr" in fillChild && themeColors) {
                    const schemeName = fillChild[":@"]?.["@_val"];
                    if (schemeName) {
                      const color = themeColors.get(schemeName);
                      if (color) {
                        style.color = color;
                        hasProperty = true;
                      }
                    }
                  }
                }
              }
            }

            return hasProperty ? style : undefined;
          }
        }
        return undefined; // Found a:r but no a:rPr
      }
    }
  }

  // No a:r found - return paragraph-level properties (align, defRPr size) if any
  const style: FontStyle = {};
  let hasProperty = false;
  if (align) {
    style.align = align;
    hasProperty = true;
  }
  if (lineHeight != null) {
    style.lineHeight = lineHeight;
    hasProperty = true;
  }
  if (lineSpacingPoints != null) {
    style.lineSpacingPoints = lineSpacingPoints;
    hasProperty = true;
  }
  if (defRPrSize != null) {
    style.sizePoints = defRPrSize;
    hasProperty = true;
  }
  return hasProperty ? style : undefined;
}

export function extractSlideBackground(
  nodes: XmlNode[],
  relationships: Map<string, string>,
  themeColors?: Map<string, string>,
): SlideBackground | undefined {
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      if (key === "p:bg") {
        for (const bgChild of node[key]) {
          // Explicit background properties
          if ("p:bgPr" in bgChild) {
            const bgPrNodes = bgChild["p:bgPr"];
            const fill = extractSolidFill(bgPrNodes, themeColors);
            if (fill) return { fill };
            const image = extractImageRef(bgPrNodes, relationships);
            if (image) return { image };
          }
          // Theme background reference - scheme color is a direct child
          if ("p:bgRef" in bgChild) {
            for (const refChild of bgChild["p:bgRef"]) {
              if ("a:schemeClr" in refChild && themeColors) {
                const schemeName = refChild[":@"]?.["@_val"];
                if (schemeName) {
                  const color = themeColors.get(schemeName);
                  if (color) return { fill: { type: "solid", color } };
                }
              }
              if ("a:srgbClr" in refChild) {
                const val = refChild[":@"]?.["@_val"];
                if (val) return { fill: { type: "solid", color: `#${val}` } };
              }
            }
          }
        }
        return undefined;
      }
      // Recurse into container elements to reach p:bg
      if (
        key === "p:cSld" ||
        key === "p:sld" ||
        key === "p:sldLayout" ||
        key === "p:sldMaster"
      ) {
        const result = extractSlideBackground(
          node[key],
          relationships,
          themeColors,
        );
        if (result) return result;
      }
    }
  }
  return undefined;
}

export function extractLineColor(
  nodes: XmlNode[],
  themeColors?: Map<string, string>,
): ShapeFill | undefined {
  // First try explicit line color from p:spPr > a:ln > a:solidFill
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      if (key === "a:ln") {
        const fill = extractSolidFill(node[key], themeColors);
        if (fill) return fill;
      }
      if (key === "p:spPr") {
        const fill = extractLineColor(node[key], themeColors);
        if (fill) return fill;
      }
    }
  }
  // Fall back to p:style > a:lnRef > a:schemeClr
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === "p:style") {
        for (const styleChild of node[key]) {
          if ("a:lnRef" in styleChild) {
            for (const lnRefChild of styleChild["a:lnRef"]) {
              if ("a:srgbClr" in lnRefChild) {
                const val = lnRefChild[":@"]?.["@_val"];
                if (val) return { type: "solid", color: `#${val}` };
              }
              if ("a:schemeClr" in lnRefChild && themeColors) {
                const schemeName = lnRefChild[":@"]?.["@_val"];
                if (schemeName) {
                  const color = themeColors.get(schemeName);
                  if (color) return { type: "solid", color };
                }
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

function extractPlaceholderType(shapeNodes: XmlNode[]): string | undefined {
  for (const node of shapeNodes) {
    for (const key of Object.keys(node)) {
      if (key === "p:nvSpPr") {
        for (const nvChild of node[key]) {
          if ("p:nvPr" in nvChild) {
            for (const nvPrChild of nvChild["p:nvPr"]) {
              if ("p:ph" in nvPrChild) {
                return nvPrChild[":@"]?.["@_type"] ?? "obj";
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

function getMasterStyleEntry(
  placeholderType: string | undefined,
  masterStyles?: MasterTextStyles,
): MasterTextStyleEntry | undefined {
  if (!masterStyles) return undefined;
  if (placeholderType === "title" || placeholderType === "ctrTitle") {
    return masterStyles.title;
  }
  if (
    placeholderType === "body" ||
    placeholderType === "subTitle" ||
    placeholderType === "obj"
  ) {
    return masterStyles.body;
  }
  // Non-placeholder shapes or unknown types fall back to otherStyle
  return masterStyles.other;
}

export interface PlaceholderPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  fontStyle?: FontStyle;
}

/**
 * Extract placeholder positions from a slide layout XML.
 * Returns a map of placeholder type (or "idx:N" for untyped) to pixel positions.
 */
export function extractLayoutPlaceholderPositions(
  layoutXml: string,
): Map<string, PlaceholderPosition> {
  const parsed = parser.parse(layoutXml);
  const positions = new Map<string, PlaceholderPosition>();

  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;
        if (key === "p:sp") {
          processLayoutShape(node[key]);
        } else if (Array.isArray(node[key])) {
          walk(node[key]);
        }
      }
    }
  }

  function processLayoutShape(shapeNodes: XmlNode[]) {
    // Find placeholder type/idx
    let phType: string | undefined;
    let phIdx: string | undefined;
    for (const node of shapeNodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:nvSpPr") {
          for (const nvChild of node[key]) {
            if ("p:nvPr" in nvChild) {
              for (const nvPrChild of nvChild["p:nvPr"]) {
                if ("p:ph" in nvPrChild) {
                  phType = nvPrChild[":@"]?.["@_type"];
                  phIdx = nvPrChild[":@"]?.["@_idx"];
                }
              }
            }
          }
        }
      }
    }

    if (!phType && !phIdx) return;

    // Extract position from p:spPr > a:xfrm
    let position: PlaceholderPosition | undefined;
    for (const node of shapeNodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:spPr") {
          for (const prop of node[key]) {
            if ("a:xfrm" in prop) {
              let x = 0,
                y = 0,
                width = 0,
                height = 0;
              let found = false;
              for (const child of prop["a:xfrm"]) {
                const attrs = child[":@"];
                if (attrs?.["@_x"] != null) {
                  x = emuToPx(Number(attrs["@_x"]));
                  y = emuToPx(Number(attrs["@_y"]));
                  found = true;
                }
                if (attrs?.["@_cx"] != null) {
                  width = emuToPx(Number(attrs["@_cx"]));
                  height = emuToPx(Number(attrs["@_cy"]));
                }
              }
              if (found) position = { x, y, width, height };
            }
          }
        }
      }
    }

    if (!position) return;

    // Extract font style from layout placeholder's p:txBody
    let fontStyle: FontStyle | undefined;
    for (const node of shapeNodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:txBody") {
          for (const bodyNode of node[key]) {
            if ("a:p" in bodyNode && !fontStyle) {
              fontStyle = extractFontStyle(bodyNode["a:p"]);
            }
          }
        }
      }
    }

    // Store by type first, fall back to idx
    const entry: PlaceholderPosition = {
      ...position,
      ...(fontStyle && { fontStyle }),
    };
    if (phType) {
      positions.set(phType, entry);
    } else if (phIdx) {
      positions.set(`idx:${phIdx}`, entry);
    }
  }

  walk(parsed);
  return positions;
}

export function extractSlideLayout(
  xml: string,
  slideIndex: number,
  relationships?: Map<string, string>,
  themeColors?: Map<string, string>,
  masterTextStyles?: MasterTextStyles,
  layoutPlaceholderPositions?: Map<string, PlaceholderPosition>,
): {
  regions: TextRegion[];
  shapes: VisualShape[];
  background?: SlideBackground;
} {
  const parsed = parser.parse(xml);
  const regions: TextRegion[] = [];
  const shapes: VisualShape[] = [];
  const rels = relationships ?? new Map<string, string>();
  let paragraphIndex = 0;
  let shapeOrder = 1; // 0 reserved for background

  function walkShapes(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;
        if (key === "p:sp") {
          processShape(node[key]);
        } else if (key === "p:pic") {
          processPicture(node[key]);
        } else if (key === "p:cxnSp") {
          processConnector(node[key]);
        } else if (key === "p:grpSp") {
          walkShapes(node[key]);
        } else if (Array.isArray(node[key])) {
          walkShapes(node[key]);
        }
      }
    }
  }

  function processPicture(picNodes: XmlNode[]) {
    const position = extractPosition(picNodes);
    if (!position) return;
    const image = extractImageRef(picNodes, rels);
    if (image) {
      shapes.push({
        ...position,
        image,
        zIndex: shapeOrder++,
      });
    }
  }

  function processConnector(connectorNodes: XmlNode[]) {
    const position = extractPosition(connectorNodes);
    if (!position) return;
    const fill = extractLineColor(connectorNodes, themeColors);
    if (fill) {
      // Ensure thin lines have at least 1px visible dimension
      if (position.height === 0) position.height = 1;
      if (position.width === 0) position.width = 1;
      shapes.push({
        ...position,
        fill,
        zIndex: shapeOrder++,
      });
    }
  }

  function processShape(shapeNodes: XmlNode[]) {
    const paragraphCount = countParagraphs(shapeNodes);
    let position = extractPosition(shapeNodes);

    // If no explicit position, try inheriting from slide layout placeholder
    if (!position) {
      const phType = extractPlaceholderType(shapeNodes);
      if (phType && layoutPlaceholderPositions) {
        const layoutPos = layoutPlaceholderPositions.get(phType);
        if (layoutPos) {
          position = { ...layoutPos };
        }
      }
    }

    // Final fallback to hardcoded position
    if (!position) {
      position = {
        x: 50,
        y: 50 + paragraphIndex * 80,
        width: 800,
        height: 60 * (paragraphCount || 1),
      };
    }

    const currentZIndex = shapeOrder++;

    // Non-text shapes with fills, images, or outlines become visual shapes
    if (paragraphCount === 0) {
      const isLineShape = hasLinePresetGeometry(shapeNodes);
      const fill = extractShapeFill(shapeNodes);
      const image = extractImageRef(shapeNodes, rels);
      const lineFill = extractLineColor(shapeNodes, themeColors);
      if (fill || image || lineFill) {
        // Line shapes (prst="line") render as their outline, not their area fill
        const renderFill =
          isLineShape && lineFill ? lineFill : (fill ?? lineFill);
        // Ensure 0-dimension shapes are at least 1px visible
        if (position.height === 0) position.height = 1;
        if (position.width === 0) position.width = 1;
        shapes.push({
          ...position,
          fill: renderFill,
          image,
          zIndex: currentZIndex,
        });
      }
      return;
    }

    // Text shapes that also have a fill or image: render the fill as a visual shape too
    const shapeFill = extractShapeFill(shapeNodes);
    const shapeImage = extractImageRef(shapeNodes, rels);
    if (shapeFill || shapeImage) {
      shapes.push({
        ...position,
        fill: shapeFill,
        image: shapeImage,
        zIndex: currentZIndex,
      });
    }

    // Text shapes - extract font style from first paragraph, fall back to layout then master
    let fontStyle = extractFontStyleFromShape(shapeNodes);
    const phType = extractPlaceholderType(shapeNodes);

    // Fall back to slide layout placeholder font style
    if (phType && layoutPlaceholderPositions) {
      const layoutEntry = layoutPlaceholderPositions.get(phType);
      if (layoutEntry?.fontStyle) {
        if (!fontStyle?.sizePoints && layoutEntry.fontStyle.sizePoints) {
          fontStyle = {
            ...fontStyle,
            sizePoints: layoutEntry.fontStyle.sizePoints,
          };
        }
        if (!fontStyle?.align && layoutEntry.fontStyle.align) {
          fontStyle = { ...fontStyle, align: layoutEntry.fontStyle.align };
        }
        if (!fontStyle?.lineHeight && layoutEntry.fontStyle.lineHeight) {
          fontStyle = {
            ...fontStyle,
            lineHeight: layoutEntry.fontStyle.lineHeight,
          };
        }
        if (
          !fontStyle?.lineSpacingPoints &&
          layoutEntry.fontStyle.lineSpacingPoints
        ) {
          fontStyle = {
            ...fontStyle,
            lineSpacingPoints: layoutEntry.fontStyle.lineSpacingPoints,
          };
        }
      }
    }

    // ctrTitle = "centered title", subTitle on title slides is also centered per OOXML spec
    // TODO: read a:lstStyle from layout/master placeholders instead of hardcoding
    if ((phType === "ctrTitle" || phType === "subTitle") && !fontStyle?.align) {
      fontStyle = { ...fontStyle, align: "center" };
    }

    // Fall back to slide master text styles
    const masterEntry = getMasterStyleEntry(phType, masterTextStyles);
    if (masterEntry) {
      if (!fontStyle?.sizePoints && masterEntry.size) {
        fontStyle = { ...fontStyle, sizePoints: masterEntry.size };
      }
      if (!fontStyle?.align && masterEntry.align) {
        fontStyle = { ...fontStyle, align: masterEntry.align };
      }
      if (!fontStyle?.lineHeight && masterEntry.lineHeight) {
        fontStyle = { ...fontStyle, lineHeight: masterEntry.lineHeight };
      }
      if (!fontStyle?.lineSpacingPoints && masterEntry.lineSpacingPoints) {
        fontStyle = {
          ...fontStyle,
          lineSpacingPoints: masterEntry.lineSpacingPoints,
        };
      }
    }

    // Stack multiple paragraphs vertically within the shape bounds
    const perParagraphHeight = Math.round(position.height / paragraphCount);
    for (let index = 0; index < paragraphCount; index++) {
      regions.push({
        segmentId: `pptx-s${slideIndex}-p${paragraphIndex + index}`,
        x: position.x,
        y: position.y + index * perParagraphHeight,
        width: position.width,
        height: perParagraphHeight,
        fontStyle,
        zIndex: currentZIndex,
      });
    }
    paragraphIndex += paragraphCount;
  }

  function hasLinePresetGeometry(nodes: XmlNode[]): boolean {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:spPr") {
          for (const prop of node[key]) {
            if ("a:prstGeom" in prop) {
              return prop[":@"]?.["@_prst"] === "line";
            }
          }
        }
      }
    }
    return false;
  }

  function extractShapeFill(nodes: XmlNode[]): ShapeFill | undefined {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:spPr") {
          // Only check direct fill children of spPr, not inside a:ln
          for (const prop of node[key]) {
            if ("a:solidFill" in prop) {
              return extractSolidFill([prop], themeColors);
            }
          }
          return undefined;
        }
      }
    }
    return undefined;
  }

  function extractFontStyleFromShape(nodes: XmlNode[]): FontStyle | undefined {
    let fontScale = 1;
    let style: FontStyle | undefined;

    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:txBody") {
          for (const bodyNode of node[key]) {
            // Read auto-fit font scale from a:bodyPr > a:normAutofit
            if ("a:bodyPr" in bodyNode) {
              for (const bpChild of bodyNode["a:bodyPr"]) {
                if ("a:normAutofit" in bpChild) {
                  const scaleVal = bpChild[":@"]?.["@_fontScale"];
                  if (scaleVal) {
                    fontScale = Number(scaleVal) / 100000;
                  }
                }
              }
            }
            if ("a:p" in bodyNode) {
              const texts: string[] = [];
              collectTexts(bodyNode["a:p"], texts);
              if (texts.join("").trim() && !style) {
                style = extractFontStyle(bodyNode["a:p"], themeColors);
              }
            }
          }
        }
      }
    }

    if (style && fontScale !== 1 && style.sizePoints) {
      style = { ...style, sizePoints: style.sizePoints * fontScale };
    }

    return style;
  }

  function extractPosition(
    nodes: XmlNode[],
  ): { x: number; y: number; width: number; height: number } | null {
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;
    let found = false;

    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:spPr" || key === "p:blipFill" || key === "p:nvPicPr") {
          // skip, position is in sibling elements
        }
        if (key === "p:spPr") {
          for (const prop of node[key]) {
            if ("a:xfrm" in prop) {
              for (const child of prop["a:xfrm"]) {
                const attrs = child[":@"];
                if (attrs?.["@_x"] != null) {
                  x = emuToPx(Number(attrs["@_x"]));
                  y = emuToPx(Number(attrs["@_y"]));
                  found = true;
                }
                if (attrs?.["@_cx"] != null) {
                  width = emuToPx(Number(attrs["@_cx"]));
                  height = emuToPx(Number(attrs["@_cy"]));
                }
              }
            }
          }
        }
      }
    }
    return found ? { x, y, width, height } : null;
  }

  function countParagraphs(nodes: XmlNode[]): number {
    let count = 0;
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "p:txBody") {
          for (const bodyNode of node[key]) {
            if ("a:p" in bodyNode) {
              const texts: string[] = [];
              collectTexts(bodyNode["a:p"], texts);
              if (texts.join("").trim()) count++;
            }
          }
        }
      }
    }
    return count;
  }

  function collectTexts(nodes: XmlNode[], texts: string[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@") continue;
        if (key === "a:t") {
          for (const textNode of node[key]) {
            if ("#text" in textNode) texts.push(String(textNode["#text"]));
          }
        } else if (Array.isArray(node[key])) {
          collectTexts(node[key], texts);
        }
      }
    }
  }

  const background = extractSlideBackground(parsed, rels, themeColors);
  walkShapes(parsed);
  return { regions, shapes, background };
}

export function extractSlideImages(
  files: Record<string, Uint8Array>,
  mediaPaths: string[],
): SlideImageData[] {
  const images: SlideImageData[] = [];
  for (const mediaPath of mediaPaths) {
    const bytes = files[mediaPath];
    if (bytes) {
      const extension = mediaPath.split(".").pop()?.toLowerCase() ?? "";
      images.push({
        mediaPath,
        bytes,
        contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
      });
    }
  }
  return images;
}

function resolveInheritedBackground(
  files: Record<string, Uint8Array>,
  slideRels: Map<string, string>,
  themeColors: Map<string, string>,
): SlideBackground | undefined {
  // Find slide layout path from slide relationships
  let layoutPath: string | undefined;
  for (const target of slideRels.values()) {
    if (target.match(/slideLayouts\/slideLayout\d+\.xml$/)) {
      layoutPath = target;
      break;
    }
  }

  if (layoutPath) {
    const layoutContent = files[layoutPath];
    if (layoutContent) {
      const layoutXml = new TextDecoder().decode(layoutContent);
      const layoutParsed = parser.parse(layoutXml);

      // Parse layout relationships so image backgrounds can resolve rIds
      const layoutRelsPath = layoutPath.replace(
        /ppt\/slideLayouts\/(slideLayout\d+\.xml)/,
        "ppt/slideLayouts/_rels/$1.rels",
      );
      const layoutRelsContent = files[layoutRelsPath];
      const layoutRels = layoutRelsContent
        ? parseRelationships(new TextDecoder().decode(layoutRelsContent))
        : new Map<string, string>();

      const layoutBg = extractSlideBackground(
        layoutParsed,
        layoutRels,
        themeColors,
      );
      if (layoutBg) return layoutBg;

      // Check slide master from layout's relationships
      for (const target of layoutRels.values()) {
        if (target.match(/slideMasters\/slideMaster\d+\.xml$/)) {
          const masterContent = files[target];
          if (masterContent) {
            const masterXml = new TextDecoder().decode(masterContent);
            const masterParsed = parser.parse(masterXml);

            // Parse master relationships for image backgrounds
            const masterRelsPath = target.replace(
              /ppt\/slideMasters\/(slideMaster\d+\.xml)/,
              "ppt/slideMasters/_rels/$1.rels",
            );
            const masterRelsContent = files[masterRelsPath];
            const masterRels = masterRelsContent
              ? parseRelationships(new TextDecoder().decode(masterRelsContent))
              : new Map<string, string>();

            const masterBg = extractSlideBackground(
              masterParsed,
              masterRels,
              themeColors,
            );
            if (masterBg) return masterBg;
          }
          break;
        }
      }
    }
  }

  return undefined;
}

export function extractPptxLayout(data: Uint8Array): {
  layouts: SlideLayout[];
  mediaPaths: string[];
} {
  const files = unzipSync(data);
  const layouts: SlideLayout[] = [];
  const mediaPathSet = new Set<string>();

  // Parse theme colors for scheme color resolution
  const themeFile = files["ppt/theme/theme1.xml"];
  const themeColors = themeFile
    ? parseThemeColors(new TextDecoder().decode(themeFile))
    : new Map<string, string>();

  // Parse master text styles for placeholder font size inheritance
  let masterTextStyles: MasterTextStyles = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.match(/^ppt\/slideMasters\/slideMaster\d+\.xml$/)) {
      masterTextStyles = parseMasterTextStyles(
        new TextDecoder().decode(content),
      );
      break; // Use the first slide master
    }
  }

  let slideWidth = 960;
  let slideHeight = 540;
  const presentationXml = files["ppt/presentation.xml"];
  if (presentationXml) {
    const xml = new TextDecoder().decode(presentationXml);
    const sizeMatch = xml.match(/p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
    if (sizeMatch) {
      slideWidth = emuToPx(Number(sizeMatch[1]));
      slideHeight = emuToPx(Number(sizeMatch[2]));
    }
  }

  for (const [path, content] of Object.entries(files)) {
    if (!path.match(/^ppt\/slides\/slide\d+\.xml$/)) continue;
    const xml = new TextDecoder().decode(content);
    const slideIndex = Number(path.match(/slide(\d+)/)?.[1]) - 1;

    // Parse relationships for this slide
    const relsPath = path.replace(
      /ppt\/slides\/(slide\d+\.xml)/,
      "ppt/slides/_rels/$1.rels",
    );
    const relsContent = files[relsPath];
    const relationships = relsContent
      ? parseRelationships(new TextDecoder().decode(relsContent))
      : new Map<string, string>();

    // Parse slide layout for placeholder positions and inherited shapes
    let layoutPlaceholderPositions:
      | Map<string, PlaceholderPosition>
      | undefined;
    let layoutShapes: VisualShape[] = [];
    for (const target of relationships.values()) {
      if (target.match(/slideLayouts\/slideLayout\d+\.xml$/)) {
        const layoutContent = files[target];
        if (layoutContent) {
          const layoutXmlStr = new TextDecoder().decode(layoutContent);
          layoutPlaceholderPositions =
            extractLayoutPlaceholderPositions(layoutXmlStr);

          // Extract visual shapes from the layout (background images, decorative elements)
          const layoutRelsPath = target.replace(
            /ppt\/slideLayouts\/(slideLayout\d+\.xml)/,
            "ppt/slideLayouts/_rels/$1.rels",
          );
          const layoutRelsContent = files[layoutRelsPath];
          const layoutRels = layoutRelsContent
            ? parseRelationships(new TextDecoder().decode(layoutRelsContent))
            : new Map<string, string>();

          const layoutResult = extractSlideLayout(
            layoutXmlStr,
            slideIndex,
            layoutRels,
            themeColors,
          );
          // Only inherit image shapes from the layout (background images).
          // Non-image shapes (connectors, fills, placeholders) either can't be
          // rendered with full fidelity (shadows/glows) or are content templates.
          layoutShapes = layoutResult.shapes
            .filter((s) => s.image)
            .map((s) => ({ ...s, source: "layout" as const }));
        }
        break;
      }
    }

    const { regions, shapes, background } = extractSlideLayout(
      xml,
      slideIndex,
      relationships,
      themeColors,
      masterTextStyles,
      layoutPlaceholderPositions,
    );

    // Inherit background from slide layout or slide master if not on slide
    let resolvedBackground = background;
    if (!resolvedBackground) {
      resolvedBackground = resolveInheritedBackground(
        files,
        relationships,
        themeColors,
      );
    }

    // Merge layout shapes (behind) with slide shapes and regions (in front)
    // Offset slide z-indices above layout shapes so slide content renders on top
    const layoutMaxZ =
      layoutShapes.length > 0
        ? Math.max(...layoutShapes.map((s) => s.zIndex))
        : 0;
    const offsetShapes =
      layoutMaxZ > 0
        ? shapes.map((s) => ({
            ...s,
            zIndex: s.zIndex + layoutMaxZ,
            source: "slide" as const,
          }))
        : shapes.map((s) => ({ ...s, source: "slide" as const }));
    const offsetRegions =
      layoutMaxZ > 0
        ? regions.map((r) => ({ ...r, zIndex: r.zIndex + layoutMaxZ }))
        : regions;
    const allShapes = [...layoutShapes, ...offsetShapes];

    // Filter out full-slide solid fill shapes (layout/master background rectangles)
    // but keep images since they are intentional background visuals
    const filteredShapes = allShapes.filter((shape) => {
      if (shape.image) return true;
      const coversSlide =
        shape.width >= slideWidth * 0.9 && shape.height >= slideHeight * 0.9;
      return !coversSlide;
    });

    // Collect media paths from shapes and background
    for (const shape of filteredShapes) {
      if (shape.image) mediaPathSet.add(shape.image.mediaPath);
    }
    if (resolvedBackground?.image)
      mediaPathSet.add(resolvedBackground.image.mediaPath);

    // Default text color: when background is dark, use lt1 (light); otherwise dk1 (dark)
    const bgColor = resolvedBackground?.fill?.color ?? "#FFFFFF";
    const bgIsDark = isColorDark(bgColor);
    const defaultTextColor = bgIsDark
      ? (themeColors.get("lt1") ?? "#FFFFFF")
      : (themeColors.get("dk1") ?? "#000000");

    layouts.push({
      slideIndex,
      width: slideWidth,
      height: slideHeight,
      regions: offsetRegions,
      shapes: filteredShapes,
      background: resolvedBackground,
      defaultTextColor,
    });
  }

  layouts.sort((a, b) => a.slideIndex - b.slideIndex);
  return { layouts, mediaPaths: [...mediaPathSet] };
}

export function reconstructPptx(
  originalData: Uint8Array,
  translations: Map<string, string>,
): Uint8Array {
  const files = unzipSync(originalData);

  for (const [path, content] of Object.entries(files)) {
    if (!path.match(/^ppt\/slides\/slide\d+\.xml$/)) continue;

    const xml = new TextDecoder().decode(content);
    const slideIndex = Number(path.match(/slide(\d+)/)?.[1]) - 1;
    const newXml = replaceTextInSlideXml(xml, translations, slideIndex);
    files[path] = new TextEncoder().encode(newXml);
  }

  return zipSync(files);
}
