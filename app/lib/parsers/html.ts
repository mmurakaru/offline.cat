export interface ExtractedSegment {
  id: string;
  source: string;
}

const SKIP_TAGS = /^(script|style|noscript)$/i;
const TAG_REGEX = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;

export function extractSegments(html: string): ExtractedSegment[] {
  const segments: ExtractedSegment[] = [];
  let index = 0;
  let lastIndex = 0;
  let skipDepth = 0;
  let skipTag = "";

  TAG_REGEX.lastIndex = 0;
  let match = TAG_REGEX.exec(html);

  while (match) {
    const textBefore = html.slice(lastIndex, match.index);

    if (skipDepth === 0) {
      const trimmed = textBefore.trim();
      if (trimmed) {
        segments.push({ id: `html-${index++}`, source: trimmed });
      }
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

    lastIndex = match.index + match[0].length;
    match = TAG_REGEX.exec(html);
  }

  // Text after the last tag
  if (skipDepth === 0) {
    const trailing = html.slice(lastIndex).trim();
    if (trailing) {
      segments.push({ id: `html-${index++}`, source: trailing });
    }
  }

  return segments;
}

export function reconstructHtml(
  html: string,
  translations: Map<string, string>,
): string {
  let index = 0;
  let lastIndex = 0;
  let skipDepth = 0;
  let skipTag = "";
  const parts: string[] = [];

  TAG_REGEX.lastIndex = 0;
  let match = TAG_REGEX.exec(html);

  while (match) {
    const textBefore = html.slice(lastIndex, match.index);

    if (skipDepth === 0 && textBefore.trim()) {
      const id = `html-${index++}`;
      const translation = translations.get(id);
      if (translation) {
        // Preserve leading/trailing whitespace from original
        const leadingWs = textBefore.match(/^\s*/)?.[0] ?? "";
        const trailingWs = textBefore.match(/\s*$/)?.[0] ?? "";
        parts.push(leadingWs + translation + trailingWs);
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
    match = TAG_REGEX.exec(html);
  }

  // Trailing text after last tag
  const trailing = html.slice(lastIndex);
  if (skipDepth === 0 && trailing.trim()) {
    const id = `html-${index++}`;
    const translation = translations.get(id);
    if (translation) {
      const leadingWs = trailing.match(/^\s*/)?.[0] ?? "";
      const trailingWs = trailing.match(/\s*$/)?.[0] ?? "";
      parts.push(leadingWs + translation + trailingWs);
    } else {
      parts.push(trailing);
    }
  } else {
    parts.push(trailing);
  }

  return parts.join("");
}
