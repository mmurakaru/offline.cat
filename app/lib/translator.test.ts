import { afterEach, describe, expect, it, vi } from "vitest";
import { isTranslatorAvailable, translateSegments } from "./translator";

describe("isTranslatorAvailable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when Translator API is undefined", async () => {
    // Arrange - no Translator in global scope

    // Act
    const result = await isTranslatorAvailable("en", "es");

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when source language is empty", async () => {
    // Arrange
    vi.stubGlobal("Translator", {
      availability: vi.fn(),
    });

    // Act
    const result = await isTranslatorAvailable("", "es");

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when target language is empty", async () => {
    // Arrange
    vi.stubGlobal("Translator", {
      availability: vi.fn(),
    });

    // Act
    const result = await isTranslatorAvailable("en", "");

    // Assert
    expect(result).toBe(false);
  });
});

describe("translateSegments", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when Translator API is undefined", async () => {
    // Arrange
    vi.stubGlobal("Translator", undefined);
    const controller = new AbortController();

    // Act & Assert
    await expect(
      translateSegments(
        [{ id: "1", source: "Hello" }],
        "en",
        "es",
        controller.signal,
        () => {},
      ),
    ).rejects.toThrow("Translator API not available");
  });

  it("throws when source language is empty", async () => {
    // Arrange
    vi.stubGlobal("Translator", {
      create: vi.fn(),
    });
    const controller = new AbortController();

    // Act & Assert
    await expect(
      translateSegments(
        [{ id: "1", source: "Hello" }],
        "",
        "es",
        controller.signal,
        () => {},
      ),
    ).rejects.toThrow("Source and target languages must be selected");
  });

  it("translates segments and calls onProgress for each", async () => {
    // Arrange
    const mockTranslator = {
      translate: vi.fn().mockResolvedValue("Hola"),
      destroy: vi.fn(),
    };
    vi.stubGlobal("Translator", {
      create: () => Promise.resolve(mockTranslator),
    });
    const controller = new AbortController();
    const onProgress = vi.fn();

    // Act
    const results = await translateSegments(
      [
        { id: "1", source: "Hello" },
        { id: "2", source: "World" },
      ],
      "en",
      "es",
      controller.signal,
      onProgress,
    );

    // Assert
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: "1", translation: "Hola" });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(mockTranslator.destroy).toHaveBeenCalledOnce();
  });

  it("stops translating when signal is aborted", async () => {
    // Arrange
    const mockTranslator = {
      translate: vi.fn().mockResolvedValue("Hola"),
      destroy: vi.fn(),
    };
    vi.stubGlobal("Translator", {
      create: () => Promise.resolve(mockTranslator),
    });
    const controller = new AbortController();
    controller.abort();
    const onProgress = vi.fn();

    // Act
    const results = await translateSegments(
      [{ id: "1", source: "Hello" }],
      "en",
      "es",
      controller.signal,
      onProgress,
    );

    // Assert
    expect(results).toHaveLength(0);
    expect(onProgress).not.toHaveBeenCalled();
    expect(mockTranslator.destroy).toHaveBeenCalledOnce();
  });
});
