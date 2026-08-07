import type { Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface ExtractedSegment {
  id: string;
  source: string;
}

export type MarkdownBlockKind = "heading" | "paragraph" | "listItem";

export interface MarkdownFrontmatterField {
  id: string;
  key: string;
  source: string;
}

export interface MarkdownBlock {
  id: string;
  kind: MarkdownBlockKind;
  level?: number;
  source: string;
}

export interface MarkdownDocument {
  frontmatter: MarkdownFrontmatterField[];
  blocks: MarkdownBlock[];
}

interface Region {
  id: string;
  source: string;
  start: number;
  end: number;
  category: "frontmatter" | MarkdownBlockKind;
  key?: string;
  level?: number;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"]);

const FRONTMATTER_FIELD = /^([A-Za-z0-9_-]+:)([ \t]+)(\S.*?)[ \t]*$/;

function collectFrontmatterRegions(text: string, tree: Root): Region[] {
  const regions: Region[] = [];

  visit(tree, "yaml", (node) => {
    const blockStart = node.position?.start.offset;
    if (blockStart === undefined) return;

    const firstNewline = text.indexOf("\n", blockStart);
    if (firstNewline === -1) return;

    let lineOffset = firstNewline + 1;
    for (const line of node.value.split("\n")) {
      const match = line.match(FRONTMATTER_FIELD);
      if (match) {
        const key = match[1].slice(0, -1);
        const value = match[3];
        const valueStart = lineOffset + match[1].length + match[2].length;
        regions.push({
          id: "",
          source: value,
          start: valueStart,
          end: valueStart + value.length,
          category: "frontmatter",
          key,
        });
      }
      lineOffset += line.length + 1;
    }
  });

  return regions;
}

function collectBlockRegions(text: string, tree: Root): Region[] {
  const regions: Region[] = [];

  visit(tree, (node, _index, parent) => {
    if (node.type !== "heading" && node.type !== "paragraph") return;

    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    const start = firstChild?.position?.start.offset;
    const end = lastChild?.position?.end.offset;
    if (start === undefined || end === undefined) return;

    const kind: MarkdownBlockKind =
      node.type === "heading"
        ? "heading"
        : parent?.type === "listItem"
          ? "listItem"
          : "paragraph";

    regions.push({
      id: "",
      source: text.slice(start, end),
      start,
      end,
      category: kind,
      level: node.type === "heading" ? node.depth : undefined,
    });
  });

  return regions;
}

function collectRegions(text: string): Region[] {
  const tree = processor.parse(text);
  const regions = [
    ...collectFrontmatterRegions(text, tree),
    ...collectBlockRegions(text, tree),
  ].sort((first, second) => first.start - second.start);

  regions.forEach((region, index) => {
    region.id = `md-${index}`;
  });

  return regions;
}

export function parseMarkdown(text: string): MarkdownDocument {
  const frontmatter: MarkdownFrontmatterField[] = [];
  const blocks: MarkdownBlock[] = [];

  for (const region of collectRegions(text)) {
    if (region.category === "frontmatter") {
      frontmatter.push({
        id: region.id,
        key: region.key ?? "",
        source: region.source,
      });
    } else {
      blocks.push({
        id: region.id,
        kind: region.category,
        level: region.level,
        source: region.source,
      });
    }
  }

  return { frontmatter, blocks };
}

export function extractSegments(text: string): ExtractedSegment[] {
  return collectRegions(text).map((region) => ({
    id: region.id,
    source: region.source,
  }));
}

export function reconstructMarkdown(
  text: string,
  translations: Map<string, string>,
): string {
  const ordered = collectRegions(text).sort(
    (first, second) => second.start - first.start,
  );

  let result = text;
  for (const region of ordered) {
    const translation = translations.get(region.id);
    if (translation === undefined) continue;
    result =
      result.slice(0, region.start) + translation + result.slice(region.end);
  }

  return result;
}
