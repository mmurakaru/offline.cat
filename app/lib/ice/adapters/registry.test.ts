import { describe, expect, it } from "vitest";
import { getParser } from "./registry";

describe("getParser", () => {
  it("returns xliff parser for xliff extension", () => {
    const parser = getParser("xliff");
    expect(parser).toBeDefined();
    expect(parser?.extensions).toContain("xliff");
  });

  it("returns xliff parser for xlf extension", () => {
    const parser = getParser("xlf");
    expect(parser).toBeDefined();
    expect(parser?.extensions).toContain("xlf");
  });

  it("returns html parser for html extension", () => {
    const parser = getParser("html");
    expect(parser).toBeDefined();
    expect(parser?.extensions).toContain("html");
  });

  it("returns html parser for htm extension", () => {
    const parser = getParser("htm");
    expect(parser).toBeDefined();
    expect(parser?.extensions).toContain("htm");
  });

  it("returns docx parser for docx extension", () => {
    const parser = getParser("docx");
    expect(parser).toBeDefined();
    expect(parser?.extensions).toContain("docx");
  });

  it("returns pptx parser for pptx extension", () => {
    const parser = getParser("pptx");
    expect(parser).toBeDefined();
    expect(parser?.extensions).toContain("pptx");
  });

  it("returns undefined for unknown extension", () => {
    expect(getParser("xyz")).toBeUndefined();
    expect(getParser("pdf")).toBeUndefined();
    expect(getParser("")).toBeUndefined();
  });

  it("is case insensitive", () => {
    expect(getParser("PPTX")).toBeDefined();
    expect(getParser("Docx")).toBeDefined();
    expect(getParser("HTML")).toBeDefined();
  });
});
