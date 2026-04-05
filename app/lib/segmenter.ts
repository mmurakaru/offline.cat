export function segmentText(text: string, locale = "en"): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
  return [...segmenter.segment(text)]
    .map((s) => s.segment.trim())
    .filter(Boolean);
}
