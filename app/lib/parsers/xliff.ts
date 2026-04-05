export interface ExtractedSegment {
  id: string;
  source: string;
  target?: string;
}

export function extractSegments(xliff: string): ExtractedSegment[] {
  const doc = new DOMParser().parseFromString(xliff, "text/xml");
  const units = doc.querySelectorAll("trans-unit");
  const segments: ExtractedSegment[] = [];

  for (const unit of units) {
    const id = unit.getAttribute("id") ?? crypto.randomUUID();
    const source = unit.querySelector("source")?.textContent ?? "";
    const target = unit.querySelector("target")?.textContent ?? undefined;

    if (source) {
      segments.push({ id, source, target });
    }
  }

  return segments;
}

export function reconstructXliff(
  xliff: string,
  translations: Map<string, string>,
): string {
  const doc = new DOMParser().parseFromString(xliff, "text/xml");
  const units = doc.querySelectorAll("trans-unit");

  for (const unit of units) {
    const id = unit.getAttribute("id");
    if (!id) continue;

    const translation = translations.get(id);
    if (!translation) continue;

    let target = unit.querySelector("target");
    if (!target) {
      target = doc.createElement("target");
      const source = unit.querySelector("source");
      source?.parentNode?.insertBefore(target, source.nextSibling);
    }
    target.textContent = translation;
  }

  return new XMLSerializer().serializeToString(doc);
}
