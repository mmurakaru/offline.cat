import type { TranslationMemoryEntry } from "./db";
import { getDB } from "./db";

export interface TranslationMemoryMatch {
  score: number;
  translation: string;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ");
}

export function tokenize(text: string): string[] {
  return text.split(" ").filter((word) => word.length > 2);
}

export function levenshtein(source: string, target: string): number {
  const sourceLength = source.length;
  const targetLength = target.length;
  const distances: number[][] = Array.from({ length: sourceLength + 1 }, () =>
    Array(targetLength + 1).fill(0),
  );

  for (let row = 0; row <= sourceLength; row++) distances[row][0] = row;
  for (let col = 0; col <= targetLength; col++) distances[0][col] = col;

  for (let row = 1; row <= sourceLength; row++) {
    for (let col = 1; col <= targetLength; col++) {
      distances[row][col] =
        source[row - 1] === target[col - 1]
          ? distances[row - 1][col - 1]
          : 1 +
            Math.min(
              distances[row - 1][col],
              distances[row][col - 1],
              distances[row - 1][col - 1],
            );
    }
  }

  return distances[sourceLength][targetLength];
}

export function similarity(source: string, target: string): number {
  const longer = source.length > target.length ? source : target;
  const shorter = source.length > target.length ? target : source;
  if (longer.length === 0) return 100;
  const editDistance = levenshtein(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

export async function findTranslationMemoryMatch(
  source: string,
  langPair: string,
): Promise<TranslationMemoryMatch> {
  const db = await getDB();
  const normalized = normalize(source);
  const tokens = tokenize(normalized);
  const allEntries = await db.getAllFromIndex(
    "translationMemory",
    "langPair",
    langPair,
  );

  let bestMatch: TranslationMemoryMatch = { score: 0, translation: "" };

  // Pre-filter by token overlap before expensive Levenshtein
  const candidates = allEntries.filter((entry) => {
    const overlap = tokens.filter((token) =>
      entry.sourceTokens.includes(token),
    ).length;
    return tokens.length === 0 || overlap / tokens.length > 0.3;
  });

  for (const entry of candidates) {
    const score = similarity(normalized, entry.sourceNormalized);
    if (score > bestMatch.score) {
      bestMatch = { score, translation: entry.target };
    }
  }

  return bestMatch;
}

export async function addTranslationMemoryEntry(
  source: string,
  target: string,
  langPair: string,
): Promise<void> {
  const db = await getDB();
  const sourceNormalized = normalize(source);
  const sourceTokens = tokenize(sourceNormalized);

  await db.put("translationMemory", {
    id: crypto.randomUUID(),
    source,
    sourceNormalized,
    sourceTokens,
    target,
    langPair,
    createdAt: Date.now(),
  });
}
