import { describe, expect, it } from "vitest";
import { distributeTextAcrossRuns } from "./distribute-text";

describe("distributeTextAcrossRuns", () => {
  it("returns full text for a single run", () => {
    // Act
    const result = distributeTextAcrossRuns([10], "Hello");

    // Assert
    expect(result).toEqual(["Hello"]);
  });

  it("splits evenly for two equal runs", () => {
    // Act
    const result = distributeTextAcrossRuns([5, 5], "abcdef");

    // Assert
    expect(result).toEqual(["abc", "def"]);
  });

  it("splits proportionally (6:5 ratio)", () => {
    // Act
    const result = distributeTextAcrossRuns([6, 5], "Hello World");

    // Assert
    expect(result.join("")).toBe("Hello World");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Hello ");
    expect(result[1]).toBe("World");
  });

  it("gives empty runs zero characters", () => {
    // Act
    const result = distributeTextAcrossRuns([5, 0, 5], "abcdefghij");

    // Assert
    expect(result).toEqual(["abcde", "", "fghij"]);
  });

  it("falls back to first run when all lengths are zero", () => {
    // Act
    const result = distributeTextAcrossRuns([0, 0, 0], "hello");

    // Assert
    expect(result).toEqual(["hello", "", ""]);
  });

  it("returns empty strings for empty translation", () => {
    // Act
    const result = distributeTextAcrossRuns([5, 3], "");

    // Assert
    expect(result).toEqual(["", ""]);
  });

  it("returns empty array for empty input array", () => {
    // Act
    const result = distributeTextAcrossRuns([], "hello");

    // Assert
    expect(result).toEqual([]);
  });

  it("handles translation longer than original", () => {
    // Act
    const result = distributeTextAcrossRuns([3, 2], "abcdefghij");

    // Assert
    expect(result.join("")).toBe("abcdefghij");
    expect(result[0].length).toBe(6);
    expect(result[1].length).toBe(4);
  });

  it("handles translation shorter than original", () => {
    // Act
    const result = distributeTextAcrossRuns([10, 10], "ab");

    // Assert
    expect(result.join("")).toBe("ab");
    expect(result[0].length).toBe(1);
    expect(result[1].length).toBe(1);
  });

  it("distributes rounding remainder correctly (3 equal runs, 2 char text)", () => {
    // Act
    const result = distributeTextAcrossRuns([3, 3, 3], "ab");

    // Assert
    expect(result.join("")).toBe("ab");
    const totalLength = result.reduce((sum, str) => sum + str.length, 0);
    expect(totalLength).toBe(2);
    const lengths = result.map((str) => str.length).sort();
    expect(lengths).toEqual([0, 1, 1]);
  });

  it("snaps split to whitespace to avoid mid-word breaks", () => {
    // Act
    const result = distributeTextAcrossRuns([5, 5], "Hello World");

    // Assert
    expect(result.join("")).toBe("Hello World");
    expect(result[0].trimEnd()).toBe("Hello");
    expect(result[1].trimStart()).toBe("World");
  });

  it("falls back to character split for CJK text (no spaces)", () => {
    // Act
    const result = distributeTextAcrossRuns([3, 3], "abcdef");

    // Assert
    expect(result).toEqual(["abc", "def"]);
  });

  it("snaps to nearest whitespace across three runs", () => {
    // Act
    const result = distributeTextAcrossRuns([6, 5, 5], "Bonjour le monde");

    // Assert
    expect(result.join("")).toBe("Bonjour le monde");
    for (const segment of result) {
      if (segment.length > 0) {
        expect(segment).not.toMatch(/^\S+\s+\S/);
      }
    }
  });
});
