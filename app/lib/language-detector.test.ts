import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLanguage } from "./language-detector";

describe("detectLanguage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when LanguageDetector API is unavailable", async () => {
    // Arrange - no LanguageDetector in global scope

    // Act
    const result = await detectLanguage("Hello world");

    // Assert
    expect(result).toBeNull();
  });

  it("returns detected language when confidence is high", async () => {
    // Arrange
    vi.stubGlobal("LanguageDetector", {
      create: () =>
        Promise.resolve({
          detect: () =>
            Promise.resolve([
              { detectedLanguage: "en", confidence: 0.95 },
              { detectedLanguage: "de", confidence: 0.03 },
            ]),
        }),
    });

    // Act
    const result = await detectLanguage("Hello world");

    // Assert
    expect(result).toBe("en");
  });

  it("returns null when confidence is below threshold", async () => {
    // Arrange
    vi.stubGlobal("LanguageDetector", {
      create: () =>
        Promise.resolve({
          detect: () =>
            Promise.resolve([{ detectedLanguage: "en", confidence: 0.3 }]),
        }),
    });

    // Act
    const result = await detectLanguage("ambiguous");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for unsupported source languages", async () => {
    // Arrange
    vi.stubGlobal("LanguageDetector", {
      create: () =>
        Promise.resolve({
          detect: () =>
            Promise.resolve([{ detectedLanguage: "sw", confidence: 0.99 }]),
        }),
    });

    // Act
    const result = await detectLanguage("Habari yako");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when detection returns empty results", async () => {
    // Arrange
    vi.stubGlobal("LanguageDetector", {
      create: () =>
        Promise.resolve({
          detect: () => Promise.resolve([]),
        }),
    });

    // Act
    const result = await detectLanguage("");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when detector throws an error", async () => {
    // Arrange
    vi.stubGlobal("LanguageDetector", {
      create: () => Promise.reject(new Error("API unavailable")),
    });

    // Act
    const result = await detectLanguage("Hello");

    // Assert
    expect(result).toBeNull();
  });
});
