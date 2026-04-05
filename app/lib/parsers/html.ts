export interface ExtractedSegment {
  id: string;
  source: string;
  nodePath: string;
}

export function extractSegments(html: string): ExtractedSegment[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const segments: ExtractedSegment[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);

  let index = 0;
  let node = walker.nextNode();

  while (node) {
    const text = node.textContent?.trim();
    if (text) {
      segments.push({
        id: `html-${index++}`,
        source: text,
        nodePath: getNodePath(node),
      });
    }
    node = walker.nextNode();
  }

  return segments;
}

export function reconstructHtml(
  html: string,
  translations: Map<string, string>,
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);

  let index = 0;
  let node = walker.nextNode();

  while (node) {
    const text = node.textContent?.trim();
    if (text) {
      const id = `html-${index++}`;
      const translation = translations.get(id);
      if (translation) {
        node.textContent = translation;
      }
    }
    node = walker.nextNode();
  }

  return doc.documentElement.outerHTML;
}

function getNodePath(node: Node): string {
  const parts: string[] = [];
  let current: Node | null = node;

  while (current && current !== current.ownerDocument) {
    if (current.parentNode) {
      const children = Array.from(current.parentNode.childNodes);
      const index = children.indexOf(current as ChildNode);
      parts.unshift(`${current.nodeName}[${index}]`);
    }
    current = current.parentNode;
  }

  return parts.join("/");
}
