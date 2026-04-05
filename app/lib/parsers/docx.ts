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

// biome-ignore lint/suspicious/noExplicitAny: fast-xml-parser preserveOrder returns untyped nodes
type XmlNode = any;

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
          const runs = node[key];
          const texts: string[] = [];
          collectTextRuns(runs, texts);
          const text = texts.join("").trim();

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

  walkParagraphs(parsed, "");
  return segments;
}

export function extractSegments(data: Uint8Array): ExtractedSegment[] {
  const files = unzipSync(data);

  const documentXml = files["word/document.xml"];
  if (!documentXml) return [];

  const xml = new TextDecoder().decode(documentXml);
  return extractTextFromDocumentXml(xml);
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
