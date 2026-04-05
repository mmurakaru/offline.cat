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
