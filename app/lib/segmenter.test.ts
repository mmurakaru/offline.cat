import { describe, expect, it } from "vitest";
import { segmentText } from "./segmenter";

describe("segmentText", () => {
  it("splits text into sentences", () => {
    const result = segmentText("Hello world. How are you? I am fine.");
    expect(result).toEqual(["Hello world.", "How are you?", "I am fine."]);
  });

  it("returns empty array for empty string", () => {
    expect(segmentText("")).toEqual([]);
  });

  it("handles single sentence without trailing period", () => {
    const result = segmentText("Hello world");
    expect(result).toEqual(["Hello world"]);
  });

  it("handles whitespace-only input", () => {
    expect(segmentText("   ")).toEqual([]);
  });

  it("preserves sentence content exactly", () => {
    const result = segmentText("Price is $9.99. Buy now!");
    expect(result.length).toBe(2);
    expect(result[0]).toContain("9.99");
  });
});
