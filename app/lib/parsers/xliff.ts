import { XMLBuilder, XMLParser } from "fast-xml-parser";

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
  target?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: fast-xml-parser preserveOrder returns untyped nodes
type XmlNode = any;

function getAttr(node: XmlNode, name: string): string | undefined {
  return node?.[":@"]?.[`@_${name}`];
}

function getTextContent(nodes: XmlNode[]): string {
  let text = "";
  for (const node of nodes) {
    if ("#text" in node) {
      text += String(node["#text"]);
    }
    for (const key of Object.keys(node)) {
      if (key === ":@" || key === "#text") continue;
      if (Array.isArray(node[key])) {
        text += getTextContent(node[key]);
      }
    }
  }
  return text;
}

export function extractSegments(xliff: string): ExtractedSegment[] {
  const parsed = parser.parse(xliff);
  const segments: ExtractedSegment[] = [];

  // In preserveOrder mode, each node is { "tagName": [...children], ":@": { "@_attr": "val" } }
  function walk(nodes: XmlNode[]) {
    for (const node of nodes) {
      if ("trans-unit" in node) {
        const id = getAttr(node, "id") ?? crypto.randomUUID();
        const children = node["trans-unit"];
        let source = "";
        let target: string | undefined;

        for (const child of children) {
          if ("source" in child) {
            source = getTextContent(child["source"]);
          } else if ("target" in child) {
            const text = getTextContent(child["target"]);
            target = text || undefined;
          }
        }

        if (source) {
          segments.push({ id, source, target });
        }
      } else {
        for (const key of Object.keys(node)) {
          if (key === ":@" || key === "#text") continue;
          if (Array.isArray(node[key])) {
            walk(node[key]);
          }
        }
      }
    }
  }

  walk(parsed);
  return segments;
}

export function reconstructXliff(
  xliff: string,
  translations: Map<string, string>,
): string {
  const parsed = parser.parse(xliff);

  function walkAndReplace(nodes: XmlNode[]) {
    for (const node of nodes) {
      if ("trans-unit" in node) {
        const id = getAttr(node, "id");
        if (!id) continue;

        const translation = translations.get(id);
        if (!translation) continue;

        const children = node["trans-unit"];
        let hasTarget = false;

        for (const child of children) {
          if ("target" in child) {
            child["target"] = [{ "#text": translation }];
            hasTarget = true;
            break;
          }
        }

        if (!hasTarget) {
          children.push({ "target": [{ "#text": translation }] });
        }
      } else {
        for (const key of Object.keys(node)) {
          if (key === ":@" || key === "#text") continue;
          if (Array.isArray(node[key])) {
            walkAndReplace(node[key]);
          }
        }
      }
    }
  }

  walkAndReplace(parsed);
  return builder.build(parsed);
}
