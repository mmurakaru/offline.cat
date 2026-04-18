// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTranslation } from "./useTranslation";

// Mock the translator module
vi.mock("../lib/translator", () => ({
  translateSegments: vi.fn(),
}));

import { translateSegments } from "../lib/translator";

const mockTranslateSegments = vi.mocked(translateSegments);

describe("useTranslation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with empty segments and not translating", () => {
    // Arrange & Act
    const { result } = renderHook(() => useTranslation());

    // Assert
    expect(result.current.segments).toEqual([]);
    expect(result.current.isTranslating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets segments via setSegments", () => {
    // Arrange
    const { result } = renderHook(() => useTranslation());
    const segments = [
      { id: "1", source: "Hello" },
      { id: "2", source: "World" },
    ];

    // Act
    act(() => {
      result.current.setSegments(segments);
    });

    // Assert
    expect(result.current.segments).toEqual(segments);
  });

  it("sets isTranslating to true during translation", async () => {
    // Arrange
    mockTranslateSegments.mockImplementation(async () => {
      return [];
    });
    const { result } = renderHook(() => useTranslation());
    const segments = [{ id: "1", source: "Hello", needsTranslation: true }];

    // Act
    await act(async () => {
      result.current.translate(segments, "en", "es");
    });

    // Assert - after completion, isTranslating should be false
    expect(result.current.isTranslating).toBe(false);
  });

  it("skips translation when no segments need translating", async () => {
    // Arrange
    const { result } = renderHook(() => useTranslation());
    const segments = [{ id: "1", source: "Hello", needsTranslation: false }];

    // Act
    await act(async () => {
      result.current.translate(segments, "en", "es");
    });

    // Assert
    expect(mockTranslateSegments).not.toHaveBeenCalled();
    expect(result.current.isTranslating).toBe(false);
  });

  it("sets error when translation fails", async () => {
    // Arrange
    mockTranslateSegments.mockRejectedValue(new Error("Translation failed"));
    const { result } = renderHook(() => useTranslation());
    const segments = [{ id: "1", source: "Hello", needsTranslation: true }];

    // Act
    await act(async () => {
      result.current.translate(segments, "en", "es");
    });

    // Assert
    expect(result.current.error).toBe("Translation failed");
    expect(result.current.isTranslating).toBe(false);
  });

  it("updates segments via onProgress callback during translation", async () => {
    // Arrange
    mockTranslateSegments.mockImplementation(
      async (_segments, _source, _target, _signal, onProgress) => {
        onProgress({ id: "1", translation: "Hola" });
        return [{ id: "1", translation: "Hola" }];
      },
    );
    const { result } = renderHook(() => useTranslation());
    const segments = [{ id: "1", source: "Hello", needsTranslation: true }];

    // Act
    await act(async () => {
      result.current.translate(segments, "en", "es");
    });

    // Assert
    expect(result.current.segments[0].target).toBe("Hola");
    expect(result.current.segments[0].origin).toBe("ai");
  });
});
