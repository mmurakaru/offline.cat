import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteClient } from "./db";
import * as dbModule from "./db";
import {
  addTranslationMemoryEntry,
  findTranslationMemoryMatch,
  levenshtein,
  normalize,
  similarity,
  tokenize,
} from "./translation-memory";

vi.mock("./db");

describe("normalize", () => {
  it("lowercases text", () => {
    // Act & Assert
    expect(normalize("Hello World")).toBe("hello world");
  });

  it("trims whitespace", () => {
    // Act & Assert
    expect(normalize("  hello  ")).toBe("hello");
  });

  it("strips punctuation", () => {
    // Act & Assert
    expect(normalize("Hello, world!")).toBe("hello world");
  });

  it("collapses multiple spaces", () => {
    // Act & Assert
    expect(normalize("hello   world")).toBe("hello world");
  });
});

describe("tokenize", () => {
  it("splits on spaces", () => {
    // Act & Assert
    expect(tokenize("hello world today")).toEqual(["hello", "world", "today"]);
  });

  it("filters out short words (<=2 chars)", () => {
    // Act & Assert
    expect(tokenize("i am a big dog")).toEqual(["big", "dog"]);
  });

  it("returns empty array for empty string", () => {
    // Act & Assert
    expect(tokenize("")).toEqual([]);
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    // Act & Assert
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns length of other string when one is empty", () => {
    // Act & Assert
    expect(levenshtein("", "hello")).toBe(5);
    expect(levenshtein("hello", "")).toBe(5);
  });

  it("calculates single character difference", () => {
    // Act & Assert
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("calculates insertion distance", () => {
    // Act & Assert
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("calculates deletion distance", () => {
    // Act & Assert
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("handles completely different strings", () => {
    // Act & Assert
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});

describe("similarity", () => {
  it("returns 100 for identical strings", () => {
    // Act & Assert
    expect(similarity("hello", "hello")).toBe(100);
  });

  it("returns 100 for two empty strings", () => {
    // Act & Assert
    expect(similarity("", "")).toBe(100);
  });

  it("returns 0 for completely different strings of same length", () => {
    // Act & Assert
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("returns a value between 0 and 100 for similar strings", () => {
    // Act
    const score = similarity("kitten", "sitting");

    // Assert
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("scores near-identical strings above 80", () => {
    // Act
    const score = similarity("the cat sat on the mat", "the cat sat on a mat");

    // Assert
    expect(score).toBeGreaterThan(80);
  });
});

function makeMockClient() {
  return {
    execute: vi.fn<SqliteClient["execute"]>().mockResolvedValue(undefined),
    query: vi.fn<SqliteClient["query"]>().mockResolvedValue([]),
    getOne: vi.fn<SqliteClient["getOne"]>().mockResolvedValue(null),
  };
}

describe("findTranslationMemoryMatch", () => {
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    mockClient = makeMockClient();
    vi.mocked(dbModule.getDB).mockResolvedValue(mockClient as SqliteClient);
  });

  it("queries by source and target locale", async () => {
    // Act
    await findTranslationMemoryMatch("Hello world", "en", "es");

    // Assert
    expect(mockClient.query).toHaveBeenCalledWith(
      "SELECT * FROM translation_memory WHERE source_locale = ? AND target_locale = ?",
      ["en", "es"],
    );
  });

  it("returns score 0 when no entries exist", async () => {
    // Arrange
    mockClient.query.mockResolvedValue([]);

    // Act
    const result = await findTranslationMemoryMatch("Hello world", "en", "es");

    // Assert
    expect(result).toEqual({ score: 0, translation: "" });
  });

  it("returns exact match with score 100", async () => {
    // Arrange
    mockClient.query.mockResolvedValue([
      {
        id: "1",
        source_text: "Hello world",
        source_normalized: "hello world",
        source_tokens: JSON.stringify(["hello", "world"]),
        target_text: "Hola mundo",
        source_locale: "en",
        target_locale: "es",
        source_prev_content: null,
        source_next_content: null,
        change_source: "HUMAN",
        created_at: 1000,
        updated_at: 1000,
      },
    ]);

    // Act
    const result = await findTranslationMemoryMatch("Hello world", "en", "es");

    // Assert
    expect(result.score).toBe(100);
    expect(result.translation).toBe("Hola mundo");
  });

  it("returns best match among multiple candidates", async () => {
    // Arrange
    mockClient.query.mockResolvedValue([
      {
        id: "1",
        source_text: "The cat sat on the mat",
        source_normalized: "the cat sat on the mat",
        source_tokens: JSON.stringify(["the", "cat", "sat", "the", "mat"]),
        target_text: "El gato se sentó en la alfombra",
        source_locale: "en",
        target_locale: "es",
        source_prev_content: null,
        source_next_content: null,
        change_source: "HUMAN",
        created_at: 1000,
        updated_at: 1000,
      },
      {
        id: "2",
        source_text: "The cat sat on a mat",
        source_normalized: "the cat sat on mat",
        source_tokens: JSON.stringify(["the", "cat", "sat", "mat"]),
        target_text: "El gato se sentó en una alfombra",
        source_locale: "en",
        target_locale: "es",
        source_prev_content: null,
        source_next_content: null,
        change_source: "HUMAN",
        created_at: 1000,
        updated_at: 1000,
      },
    ]);

    // Act
    const result = await findTranslationMemoryMatch(
      "The cat sat on the mat",
      "en",
      "es",
    );

    // Assert
    expect(result.score).toBe(100);
    expect(result.translation).toBe("El gato se sentó en la alfombra");
  });

  it("filters out entries with low token overlap", async () => {
    // Arrange
    mockClient.query.mockResolvedValue([
      {
        id: "1",
        source_text: "completely different sentence here",
        source_normalized: "completely different sentence here",
        source_tokens: JSON.stringify([
          "completely",
          "different",
          "sentence",
          "here",
        ]),
        target_text: "should not match",
        source_locale: "en",
        target_locale: "es",
        source_prev_content: null,
        source_next_content: null,
        change_source: "HUMAN",
        created_at: 1000,
        updated_at: 1000,
      },
    ]);

    // Act
    const result = await findTranslationMemoryMatch(
      "Hello world today",
      "en",
      "es",
    );

    // Assert
    expect(result.score).toBe(0);
    expect(result.translation).toBe("");
  });
});

describe("addTranslationMemoryEntry", () => {
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    mockClient = makeMockClient();
    vi.mocked(dbModule.getDB).mockResolvedValue(mockClient as SqliteClient);
  });

  it("inserts with correct SQL and parameters", async () => {
    // Act
    await addTranslationMemoryEntry("Hello world", "Hola mundo", "en", "es");

    // Assert
    expect(mockClient.execute).toHaveBeenCalledOnce();
    const [sql, params] = mockClient.execute.mock.calls[0];

    expect(sql).toContain("INSERT INTO translation_memory");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO UPDATE SET target_text = excluded.target_text");

    // params: [id, source, sourceNormalized, sourceTokens, target, sourceLocale, targetLocale, changeSource, now, now]
    const paramArray = params as unknown[];
    expect(paramArray).toHaveLength(10);
    expect(paramArray[1]).toBe("Hello world");
    expect(paramArray[2]).toBe("hello world");
    expect(JSON.parse(paramArray[3] as string)).toEqual(["hello", "world"]);
    expect(paramArray[4]).toBe("Hola mundo");
    expect(paramArray[5]).toBe("en");
    expect(paramArray[6]).toBe("es");
    expect(paramArray[7]).toBe("HUMAN");
  });

  it("uses provided changeSource", async () => {
    // Act
    await addTranslationMemoryEntry("Hello", "Hola", "en", "es", "MT");

    // Assert
    const params = mockClient.execute.mock.calls[0][1] as unknown[];
    expect(params[7]).toBe("MT");
  });

  it("defaults changeSource to HUMAN", async () => {
    // Act
    await addTranslationMemoryEntry("Hello", "Hola", "en", "es");

    // Assert
    const params = mockClient.execute.mock.calls[0][1] as unknown[];
    expect(params[7]).toBe("HUMAN");
  });

  it("sets created_at and updated_at to same timestamp", async () => {
    // Act
    await addTranslationMemoryEntry("Hello", "Hola", "en", "es");

    // Assert
    const params = mockClient.execute.mock.calls[0][1] as unknown[];
    const createdAt = params[8] as number;
    const updatedAt = params[9] as number;
    expect(createdAt).toBe(updatedAt);
    expect(createdAt).toBeGreaterThan(0);
  });
});
