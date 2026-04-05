import { describe, expect, it } from "vitest";
import { levenshtein, normalize, similarity, tokenize } from "./tm";

describe("normalize", () => {
  it("lowercases text", () => {
    expect(normalize("Hello World")).toBe("hello world");
  });

  it("trims whitespace", () => {
    expect(normalize("  hello  ")).toBe("hello");
  });

  it("strips punctuation", () => {
    expect(normalize("Hello, world!")).toBe("hello world");
  });

  it("collapses multiple spaces", () => {
    expect(normalize("hello   world")).toBe("hello world");
  });
});

describe("tokenize", () => {
  it("splits on spaces", () => {
    expect(tokenize("hello world today")).toEqual(["hello", "world", "today"]);
  });

  it("filters out short words (<=2 chars)", () => {
    expect(tokenize("i am a big dog")).toEqual(["big", "dog"]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns length of other string when one is empty", () => {
    expect(levenshtein("", "hello")).toBe(5);
    expect(levenshtein("hello", "")).toBe(5);
  });

  it("calculates single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("calculates insertion distance", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("calculates deletion distance", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("handles completely different strings", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});

describe("similarity", () => {
  it("returns 100 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(100);
  });

  it("returns 100 for two empty strings", () => {
    expect(similarity("", "")).toBe(100);
  });

  it("returns 0 for completely different strings of same length", () => {
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("returns a value between 0 and 100 for similar strings", () => {
    const score = similarity("kitten", "sitting");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("scores near-identical strings above 80", () => {
    const score = similarity("the cat sat on the mat", "the cat sat on a mat");
    expect(score).toBeGreaterThan(80);
  });
});
