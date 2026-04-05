import { describe, expect, it } from "vitest";
import { segmentText } from "./segmenter";

describe("segmentText", () => {
  it("splits text into sentences", () => {
    // Act
    const result = segmentText("Hello world. How are you? I am fine.");

    // Assert
    expect(result).toEqual(["Hello world.", "How are you?", "I am fine."]);
  });

  it("returns empty array for empty string", () => {
    // Act & Assert
    expect(segmentText("")).toEqual([]);
  });

  it("handles single sentence without trailing period", () => {
    // Act
    const result = segmentText("Hello world");

    // Assert
    expect(result).toEqual(["Hello world"]);
  });

  it("handles whitespace-only input", () => {
    // Act & Assert
    expect(segmentText("   ")).toEqual([]);
  });

  it("preserves sentence content exactly", () => {
    // Act
    const result = segmentText("Price is $9.99. Buy now!");

    // Assert
    expect(result.length).toBe(2);
    expect(result[0]).toContain("9.99");
  });
});
