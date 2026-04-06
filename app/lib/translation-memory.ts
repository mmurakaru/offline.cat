import type { TranslationMemoryRecord } from "./db";
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
  sourceLocale: string,
  targetLocale: string,
): Promise<TranslationMemoryMatch> {
  const db = await getDB();
  const normalized = normalize(source);
  const tokens = tokenize(normalized);

  const allEntries = await db.query<TranslationMemoryRecord>(
    "SELECT * FROM translation_memory WHERE source_locale = ? AND target_locale = ?",
    [sourceLocale, targetLocale],
  );

  let bestMatch: TranslationMemoryMatch = { score: 0, translation: "" };

  // Pre-filter by token overlap before expensive Levenshtein
  const candidates = allEntries.filter((entry) => {
    const entryTokens: string[] = JSON.parse(entry.source_tokens);
    const overlap = tokens.filter((token) =>
      entryTokens.includes(token),
    ).length;
    return tokens.length === 0 || overlap / tokens.length > 0.3;
  });

  for (const entry of candidates) {
    const score = similarity(normalized, entry.source_normalized);
    if (score > bestMatch.score) {
      bestMatch = { score, translation: entry.target_text };
    }
  }

  return bestMatch;
}

export async function addTranslationMemoryEntry(
  source: string,
  target: string,
  sourceLocale: string,
  targetLocale: string,
  changeSource: string = "HUMAN",
): Promise<void> {
  const db = await getDB();
  const sourceNormalized = normalize(source);
  const sourceTokens = tokenize(sourceNormalized);
  const now = Date.now();

  await db.execute(
    `INSERT INTO translation_memory (id, source_text, source_normalized, source_tokens, target_text, source_locale, target_locale, change_source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_locale, target_locale, source_normalized)
     DO UPDATE SET target_text = excluded.target_text, change_source = excluded.change_source, updated_at = excluded.updated_at`,
    [
      crypto.randomUUID(),
      source,
      sourceNormalized,
      JSON.stringify(sourceTokens),
      target,
      sourceLocale,
      targetLocale,
      changeSource,
      now,
      now,
    ],
  );
}
