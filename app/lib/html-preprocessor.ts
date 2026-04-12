export interface PreprocessedHtml {
  html: string;
  styles: string;
  segmentCount: number;
}

const SKIP_TAGS = /^(script|style|noscript)$/i;
const TAG_REGEX = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;

/**
 * Annotates HTML with data-segment-id spans around translatable text.
 * Uses the same walking logic as extractSegments in parsers/html.ts
 * to ensure segment ID parity.
 */
export function preprocessHtml(rawHtml: string): PreprocessedHtml {
  const parts: string[] = [];
  let index = 0;
  let lastIndex = 0;
  let skipDepth = 0;
  let skipTag = "";

  TAG_REGEX.lastIndex = 0;
  let match = TAG_REGEX.exec(rawHtml);

  while (match) {
    const textBefore = rawHtml.slice(lastIndex, match.index);

    if (skipDepth === 0) {
      const trimmed = textBefore.trim();
      if (trimmed) {
        // Preserve original whitespace but wrap text content
        const leadingWs = textBefore.match(/^\s*/)?.[0] ?? "";
        const trailingWs = textBefore.match(/\s*$/)?.[0] ?? "";
        parts.push(
          `${leadingWs}<span data-segment-id="html-${index}">${trimmed}</span>${trailingWs}`,
        );
        index++;
      } else {
        parts.push(textBefore);
      }
    } else {
      parts.push(textBefore);
    }

    const isClosing = match[1] === "/";
    const tagName = match[2];

    if (SKIP_TAGS.test(tagName)) {
      if (isClosing) {
        if (tagName.toLowerCase() === skipTag) skipDepth--;
      } else {
        if (skipDepth === 0) skipTag = tagName.toLowerCase();
        skipDepth++;
      }
    }

    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
    match = TAG_REGEX.exec(rawHtml);
  }

  // Trailing text after last tag
  if (skipDepth === 0) {
    const trailing = rawHtml.slice(lastIndex);
    const trimmed = trailing.trim();
    if (trimmed) {
      const leadingWs = trailing.match(/^\s*/)?.[0] ?? "";
      const trailingWs = trailing.match(/\s*$/)?.[0] ?? "";
      parts.push(
        `${leadingWs}<span data-segment-id="html-${index}">${trimmed}</span>${trailingWs}`,
      );
      index++;
    } else {
      parts.push(rawHtml.slice(lastIndex));
    }
  } else {
    parts.push(rawHtml.slice(lastIndex));
  }

  // Extract <style> content
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styleBlocks: string[] = [];
  let styleMatch = styleRegex.exec(rawHtml);
  while (styleMatch) {
    styleBlocks.push(styleMatch[1]);
    styleMatch = styleRegex.exec(rawHtml);
  }

  return {
    html: parts.join(""),
    styles: styleBlocks.join("\n"),
    segmentCount: index,
  };
}
