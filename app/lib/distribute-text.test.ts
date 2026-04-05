import { describe, expect, it } from "vitest";
import { distributeTextAcrossRuns } from "./distribute-text";

describe("distributeTextAcrossRuns", () => {
  it("returns full text for a single run", () => {
    expect(distributeTextAcrossRuns([10], "Hello")).toEqual(["Hello"]);
  });

  it("splits evenly for two equal runs", () => {
    expect(distributeTextAcrossRuns([5, 5], "abcdef")).toEqual(["abc", "def"]);
  });

  it("splits proportionally (6:5 ratio)", () => {
    const result = distributeTextAcrossRuns([6, 5], "Hello World");
    expect(result.join("")).toBe("Hello World");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Hello ");
    expect(result[1]).toBe("World");
  });

  it("gives empty runs zero characters", () => {
    const result = distributeTextAcrossRuns([5, 0, 5], "abcdefghij");
    expect(result).toEqual(["abcde", "", "fghij"]);
  });

  it("falls back to first run when all lengths are zero", () => {
    const result = distributeTextAcrossRuns([0, 0, 0], "hello");
    expect(result).toEqual(["hello", "", ""]);
  });

  it("returns empty strings for empty translation", () => {
    expect(distributeTextAcrossRuns([5, 3], "")).toEqual(["", ""]);
  });

  it("returns empty array for empty input array", () => {
    expect(distributeTextAcrossRuns([], "hello")).toEqual([]);
  });

  it("handles translation longer than original", () => {
    const result = distributeTextAcrossRuns([3, 2], "abcdefghij");
    expect(result.join("")).toBe("abcdefghij");
    expect(result[0].length).toBe(6);
    expect(result[1].length).toBe(4);
  });

  it("handles translation shorter than original", () => {
    const result = distributeTextAcrossRuns([10, 10], "ab");
    expect(result.join("")).toBe("ab");
    expect(result[0].length).toBe(1);
    expect(result[1].length).toBe(1);
  });

  it("distributes rounding remainder correctly (3 equal runs, 2 char text)", () => {
    const result = distributeTextAcrossRuns([3, 3, 3], "ab");
    expect(result.join("")).toBe("ab");
    const totalLength = result.reduce((sum, str) => sum + str.length, 0);
    expect(totalLength).toBe(2);
    // Two runs get 1 char each, one gets 0
    const lengths = result.map((str) => str.length).sort();
    expect(lengths).toEqual([0, 1, 1]);
  });

  it("snaps split to whitespace to avoid mid-word breaks", () => {
    // 5:5 ratio on "Hello World" (11 chars) would split at position 5-6
    // Without snapping: "Hello" + " World" or "Hello " + "World"
    // With snapping: should land on the space boundary
    const result = distributeTextAcrossRuns([5, 5], "Hello World");
    expect(result.join("")).toBe("Hello World");
    // Should not split mid-word
    expect(result[0].trimEnd()).toBe("Hello");
    expect(result[1].trimStart()).toBe("World");
  });

  it("falls back to character split for CJK text (no spaces)", () => {
    const result = distributeTextAcrossRuns([3, 3], "abcdef");
    expect(result).toEqual(["abc", "def"]);
  });

  it("snaps to nearest whitespace across three runs", () => {
    // "Bonjour le monde" = 16 chars, 6:5:5 ratio
    const result = distributeTextAcrossRuns([6, 5, 5], "Bonjour le monde");
    expect(result.join("")).toBe("Bonjour le monde");
    // No run should start or end mid-word
    for (const segment of result) {
      if (segment.length > 0) {
        expect(segment).not.toMatch(/^\S+\s+\S/);
      }
    }
  });
});
