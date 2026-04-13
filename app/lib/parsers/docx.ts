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
  xmlPath: string;
}

// --- Layout types for DOCX canvas editor ---

export interface DocxParagraphStyle {
  alignment?: "left" | "center" | "right" | "justify";
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  indentLeftPt?: number;
  indentFirstLinePt?: number;
}

export interface DocxRunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sizePoints?: number;
  color?: string;
  fontFamily?: string;
}

export interface DocxParagraphLayout {
  segmentId: string;
  type: "paragraph";
  text: string;
  paragraphStyle: DocxParagraphStyle;
  dominantRunStyle: DocxRunStyle;
}

export interface DocxImageBlock {
  type: "image";
  mediaPath?: string;
  contentType?: string;
}

export interface DocxTableBlock {
  type: "table";
}

export interface DocxPageBreakBlock {
  type: "pageBreak";
}

export type DocxNonTextBlock =
  | DocxImageBlock
  | DocxTableBlock
  | DocxPageBreakBlock;

export type DocxBlock = DocxParagraphLayout | DocxNonTextBlock;

export interface DocxPageDimensions {
  widthPt: number;
  heightPt: number;
  marginTopPt: number;
  marginBottomPt: number;
  marginLeftPt: number;
  marginRightPt: number;
}

export interface DocxDocumentLayout {
  pageDimensions: DocxPageDimensions;
  blocks: DocxBlock[];
}

// biome-ignore lint/suspicious/noExplicitAny: fast-xml-parser preserveOrder returns untyped nodes
type XmlNode = any;

function collectTextRuns(nodes: XmlNode[], texts: string[]) {
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      if (key === "w:t") {
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

function collectParagraphText(paragraphChildren: XmlNode[]): string {
  const texts: string[] = [];
  collectTextRuns(paragraphChildren, texts);
  return texts.join("").trim();
}

/**
 * Extract text from DOCX document.xml.
 * Groups text by paragraph (<w:p>), joining all <w:t> runs within each.
 */
export function extractTextFromDocumentXml(xml: string): ExtractedSegment[] {
  const parsed = parser.parse(xml);
  const segments: ExtractedSegment[] = [];
  let paragraphIndex = 0;

  function walkParagraphs(nodes: XmlNode[], path: string) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;

        if (key === "w:p") {
          const text = collectParagraphText(node[key]);

          if (text) {
            segments.push({
              id: `docx-p${paragraphIndex}`,
              source: text,
              xmlPath: `${path}/w:p`,
            });
            paragraphIndex++;
          }
        } else if (Array.isArray(node[key])) {
          walkParagraphs(node[key], `${path}/${key}`);
        }
      }
    }
  }

  walkParagraphs(parsed, "");
  return segments;
}

const US_LETTER_DEFAULTS: DocxPageDimensions = {
  widthPt: 612,
  heightPt: 792,
  marginTopPt: 72,
  marginBottomPt: 72,
  marginLeftPt: 90,
  marginRightPt: 90,
};

function twipsToPt(twips: number): number {
  return twips / 20;
}

function getAttr(node: XmlNode, attrName: string): string | undefined {
  return node[":@"]?.[`@_${attrName}`];
}

function extractPageDimensions(parsed: XmlNode[]): DocxPageDimensions {
  let sectPr: XmlNode[] | undefined;

  // w:sectPr is a direct child of w:body
  for (const node of parsed) {
    for (const key of Object.keys(node)) {
      if (key === "w:document" && Array.isArray(node[key])) {
        for (const bodyNode of node[key]) {
          for (const bodyKey of Object.keys(bodyNode)) {
            if (bodyKey === "w:body" && Array.isArray(bodyNode[bodyKey])) {
              for (const child of bodyNode[bodyKey]) {
                if ("w:sectPr" in child) {
                  sectPr = child["w:sectPr"];
                }
              }
            }
          }
        }
      }
    }
  }

  if (!sectPr) return { ...US_LETTER_DEFAULTS };

  let widthPt = US_LETTER_DEFAULTS.widthPt;
  let heightPt = US_LETTER_DEFAULTS.heightPt;
  let marginTopPt = US_LETTER_DEFAULTS.marginTopPt;
  let marginBottomPt = US_LETTER_DEFAULTS.marginBottomPt;
  let marginLeftPt = US_LETTER_DEFAULTS.marginLeftPt;
  let marginRightPt = US_LETTER_DEFAULTS.marginRightPt;

  for (const child of sectPr) {
    if ("w:pgSz" in child) {
      const width = getAttr(child, "w:w");
      const height = getAttr(child, "w:h");
      if (width) widthPt = twipsToPt(Number(width));
      if (height) heightPt = twipsToPt(Number(height));
    }
    if ("w:pgMar" in child) {
      const top = getAttr(child, "w:top");
      const bottom = getAttr(child, "w:bottom");
      const left = getAttr(child, "w:left");
      const right = getAttr(child, "w:right");
      if (top) marginTopPt = twipsToPt(Number(top));
      if (bottom) marginBottomPt = twipsToPt(Number(bottom));
      if (left) marginLeftPt = twipsToPt(Number(left));
      if (right) marginRightPt = twipsToPt(Number(right));
    }
  }

  return {
    widthPt,
    heightPt,
    marginTopPt,
    marginBottomPt,
    marginLeftPt,
    marginRightPt,
  };
}

function extractRunStyle(runChildren: XmlNode[]): DocxRunStyle {
  const style: DocxRunStyle = {};

  for (const node of runChildren) {
    if (!("w:rPr" in node)) continue;
    const rPr = node["w:rPr"];
    if (!Array.isArray(rPr)) continue;

    for (const prop of rPr) {
      if ("w:b" in prop) style.bold = true;
      if ("w:i" in prop) style.italic = true;
      if ("w:u" in prop) style.underline = true;
      if ("w:sz" in prop) {
        const val = getAttr(prop, "w:val");
        if (val) style.sizePoints = Number(val) / 2;
      }
      if ("w:color" in prop) {
        const val = getAttr(prop, "w:val");
        if (val && val !== "auto") style.color = `#${val}`;
      }
      if ("w:rFonts" in prop) {
        const ascii = getAttr(prop, "w:ascii");
        if (ascii) style.fontFamily = ascii;
      }
    }
  }

  return style;
}

function extractDominantRunStyle(paragraphChildren: XmlNode[]): DocxRunStyle {
  let longestLength = 0;
  let dominantStyle: DocxRunStyle = {};

  for (const node of paragraphChildren) {
    if (!("w:r" in node)) continue;
    const runChildren = node["w:r"];
    if (!Array.isArray(runChildren)) continue;

    // Collect text length for this run
    let textLength = 0;
    for (const child of runChildren) {
      if ("w:t" in child) {
        for (const textNode of child["w:t"]) {
          if ("#text" in textNode) {
            textLength += String(textNode["#text"]).length;
          }
        }
      }
    }

    if (textLength > longestLength) {
      longestLength = textLength;
      dominantStyle = extractRunStyle(runChildren);
    }
  }

  return dominantStyle;
}

function extractParagraphStyle(
  paragraphChildren: XmlNode[],
): DocxParagraphStyle {
  const style: DocxParagraphStyle = {};

  for (const node of paragraphChildren) {
    if (!("w:pPr" in node)) continue;
    const pPr = node["w:pPr"];
    if (!Array.isArray(pPr)) continue;

    for (const prop of pPr) {
      if ("w:jc" in prop) {
        const val = getAttr(prop, "w:val");
        if (
          val === "center" ||
          val === "right" ||
          val === "left" ||
          val === "both"
        ) {
          style.alignment = val === "both" ? "justify" : val;
        }
      }
      if ("w:spacing" in prop) {
        const before = getAttr(prop, "w:before");
        const after = getAttr(prop, "w:after");
        if (before) style.spacingBeforePt = twipsToPt(Number(before));
        if (after) style.spacingAfterPt = twipsToPt(Number(after));
      }
      if ("w:ind" in prop) {
        const left = getAttr(prop, "w:left");
        const firstLine = getAttr(prop, "w:firstLine");
        if (left) style.indentLeftPt = twipsToPt(Number(left));
        if (firstLine) style.indentFirstLinePt = twipsToPt(Number(firstLine));
      }
    }
  }

  return style;
}

function hasPageBreak(paragraphChildren: XmlNode[]): boolean {
  for (const node of paragraphChildren) {
    if (!("w:r" in node)) continue;
    const runChildren = node["w:r"];
    if (!Array.isArray(runChildren)) continue;
    for (const child of runChildren) {
      if ("w:br" in child) {
        const brType = getAttr(child, "w:type");
        if (brType === "page") return true;
      }
    }
  }
  return false;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
};

function findImageRef(
  nodes: XmlNode[],
  relationships: Map<string, string>,
): DocxImageBlock | undefined {
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === ":@" || key === "#text") continue;
      if (key === "a:blip") {
        const embedId = node[":@"]?.["@_r:embed"];
        if (embedId) {
          const mediaPath = relationships.get(String(embedId));
          if (mediaPath) {
            const extension = mediaPath.split(".").pop()?.toLowerCase() ?? "";
            return {
              type: "image",
              mediaPath,
              contentType:
                CONTENT_TYPES[extension] ?? "application/octet-stream",
            };
          }
        }
        return { type: "image" };
      }
      if (Array.isArray(node[key])) {
        const result = findImageRef(node[key], relationships);
        if (result) return result;
      }
    }
  }
  return undefined;
}

function findDrawingImage(
  paragraphChildren: XmlNode[],
  relationships: Map<string, string>,
): DocxImageBlock | undefined {
  for (const node of paragraphChildren) {
    if (!("w:r" in node)) continue;
    const runChildren = node["w:r"];
    if (!Array.isArray(runChildren)) continue;
    for (const child of runChildren) {
      if ("w:drawing" in child) {
        return (
          findImageRef(child["w:drawing"], relationships) ?? { type: "image" }
        );
      }
      if ("w:pict" in child) {
        return (
          findImageRef(child["w:pict"], relationships) ?? { type: "image" }
        );
      }
    }
  }
  return undefined;
}

function parseDocxRelationships(relsXml: string): Map<string, string> {
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
            const resolved = target.startsWith("../")
              ? `word/${target.slice(3)}`
              : target.startsWith("word/")
                ? target
                : `word/${target}`;
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

/**
 * Extract layout information from DOCX document.xml for canvas rendering.
 * Paragraph indexing matches extractTextFromDocumentXml exactly.
 */
export function extractDocxLayoutFromXml(
  xml: string,
  relationships?: Map<string, string>,
): DocxDocumentLayout {
  const parsed = parser.parse(xml);
  const blocks: DocxBlock[] = [];
  const rels = relationships ?? new Map<string, string>();
  let paragraphIndex = 0;

  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;

        if (key === "w:tbl") {
          blocks.push({ type: "table" });
        } else if (key === "w:p") {
          const children = node[key];

          if (hasPageBreak(children)) {
            blocks.push({ type: "pageBreak" });
          }

          // Check for images in this paragraph
          const imageBlock = findDrawingImage(children, rels);
          if (imageBlock) {
            blocks.push(imageBlock);
          }

          const text = collectParagraphText(children);

          if (text) {
            blocks.push({
              type: "paragraph",
              segmentId: `docx-p${paragraphIndex}`,
              text,
              paragraphStyle: extractParagraphStyle(children),
              dominantRunStyle: extractDominantRunStyle(children),
            });
            paragraphIndex++;
          }
        } else if (Array.isArray(node[key])) {
          walk(node[key]);
        }
      }
    }
  }

  walk(parsed);

  const pageDimensions = extractPageDimensions(parsed);
  return { pageDimensions, blocks };
}

export interface DocxImageData {
  mediaPath: string;
  bytes: Uint8Array;
  contentType: string;
}

export function extractDocxLayoutFromFiles(
  files: Record<string, Uint8Array>,
): {
  layout: DocxDocumentLayout;
  mediaPaths: string[];
} {
  const documentXml = files["word/document.xml"];
  if (!documentXml) {
    return {
      layout: { pageDimensions: { ...US_LETTER_DEFAULTS }, blocks: [] },
      mediaPaths: [],
    };
  }

  // Parse relationships
  const relsFile = files["word/_rels/document.xml.rels"];
  const relationships = relsFile
    ? parseDocxRelationships(new TextDecoder().decode(relsFile))
    : new Map<string, string>();

  const xml = new TextDecoder().decode(documentXml);
  const layout = extractDocxLayoutFromXml(xml, relationships);

  // Collect unique media paths from image blocks
  const mediaPaths: string[] = [];
  for (const block of layout.blocks) {
    if (block.type === "image" && block.mediaPath) {
      if (!mediaPaths.includes(block.mediaPath)) {
        mediaPaths.push(block.mediaPath);
      }
    }
  }

  return { layout, mediaPaths };
}

export function extractDocxLayout(data: Uint8Array): {
  layout: DocxDocumentLayout;
  mediaPaths: string[];
} {
  return extractDocxLayoutFromFiles(unzipSync(data));
}

export function extractDocxImages(
  files: Record<string, Uint8Array>,
  mediaPaths: string[],
): DocxImageData[] {
  const images: DocxImageData[] = [];
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

export function extractSegmentsFromFiles(
  files: Record<string, Uint8Array>,
): ExtractedSegment[] {
  const documentXml = files["word/document.xml"];
  if (!documentXml) return [];

  const xml = new TextDecoder().decode(documentXml);
  return extractTextFromDocumentXml(xml);
}

export function extractSegments(data: Uint8Array): ExtractedSegment[] {
  return extractSegmentsFromFiles(unzipSync(data));
}

export function replaceTextInDocumentXml(
  xml: string,
  translations: Map<string, string>,
): string {
  const parsed = parser.parse(xml);
  let paragraphIndex = 0;

  function walkAndReplace(nodes: XmlNode[]) {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;

        if (key === "w:p") {
          const runs = node[key];
          const texts: string[] = [];
          collectTextsForCount(runs, texts);
          const original = texts.join("").trim();

          if (original) {
            const id = `docx-p${paragraphIndex}`;
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
        if (key === "w:t") {
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
        if (key === "w:t") {
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

export function reconstructDocx(
  originalData: Uint8Array,
  translations: Map<string, string>,
): Uint8Array {
  const files = unzipSync(originalData);

  const documentXml = files["word/document.xml"];
  if (!documentXml) return zipSync(files);

  const xml = new TextDecoder().decode(documentXml);
  const newXml = replaceTextInDocumentXml(xml, translations);
  files["word/document.xml"] = new TextEncoder().encode(newXml);

  return zipSync(files);
}
