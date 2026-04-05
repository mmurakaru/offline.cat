/**
 * Proportional text distribution for multi-run paragraphs.
 *
 * Splits translated text across runs based on original character ratios
 * using largest-remainder rounding so formatting boundaries are preserved
 * approximately.
 *
 * This module is intentionally free of XML or parser dependencies
 * so it can be replaced, tested, or reused independently.
 */
export function distributeTextAcrossRuns(
  originalRunLengths: number[],
  translatedText: string,
): string[] {
  if (originalRunLengths.length === 0) return [];

  const totalOriginal = originalRunLengths.reduce(
    (sum, length) => sum + length,
    0,
  );
  const totalTranslated = translatedText.length;

  if (originalRunLengths.length === 1) return [translatedText];

  // All-zero lengths fallback: first run gets everything
  if (totalOriginal === 0) {
    return originalRunLengths.map((_, index) =>
      index === 0 ? translatedText : "",
    );
  }

  // Largest-remainder rounding
  const fractionalShares = originalRunLengths.map(
    (length) => (length / totalOriginal) * totalTranslated,
  );
  const floored = fractionalShares.map((share) => Math.floor(share));
  const remainders = fractionalShares.map(
    (share, index) => share - floored[index],
  );

  let remaining = totalTranslated - floored.reduce((sum, val) => sum + val, 0);

  // Distribute remaining characters to runs with highest fractional remainders
  const indices = originalRunLengths.map((_, index) => index);
  indices.sort((first, second) => remainders[second] - remainders[first]);

  for (const index of indices) {
    if (remaining <= 0) break;
    floored[index]++;
    remaining--;
  }

  // Build split points from floored counts
  const splitPoints: number[] = [];
  let cumulative = 0;
  for (let index = 0; index < floored.length - 1; index++) {
    cumulative += floored[index];
    splitPoints.push(cumulative);
  }

  // Snap each split point to the nearest whitespace boundary
  const snappedPoints = splitPoints.map((point) =>
    snapToWhitespace(translatedText, point),
  );

  // Slice translated text at snapped boundaries
  const result: string[] = [];
  let offset = 0;
  for (const point of snappedPoints) {
    result.push(translatedText.slice(offset, point));
    offset = point;
  }
  result.push(translatedText.slice(offset));

  return result;
}

/**
 * Nudge a split position to the nearest whitespace boundary.
 * If no whitespace exists in the text, returns the original position.
 */
function snapToWhitespace(text: string, position: number): number {
  if (position <= 0 || position >= text.length) return position;

  // Already at a word boundary
  if (text[position - 1] === " " || text[position] === " ") return position;

  // Search outward for the nearest space
  let left = position - 1;
  let right = position + 1;

  while (left > 0 || right < text.length) {
    if (left > 0 && text[left] === " ") return left + 1;
    if (right < text.length && text[right] === " ") return right;
    left--;
    right++;
  }

  // No whitespace found (e.g. CJK text) - use original position
  return position;
}
