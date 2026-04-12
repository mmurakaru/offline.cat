// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../hooks/useTranslation";
import { InspectorPanel } from "./InspectorPanel";

describe("<InspectorPanel />", () => {
  const onConfirm = vi.fn();

  afterEach(() => {
    onConfirm.mockClear();
    cleanup();
  });

  it("shows empty state when no segment is selected", () => {
    // Arrange & Act
    render(<InspectorPanel segment={null} onConfirm={onConfirm} />);

    // Assert
    expect(screen.getByText("Select a segment")).toBeTruthy();
  });

  it("renders inspector for a segment with no TM or origin", () => {
    // Arrange
    const segment: Segment = { id: "1", source: "Hello" };

    // Act
    render(<InspectorPanel segment={segment} onConfirm={onConfirm} />);

    // Assert - should render without crashing, no glossary section
    expect(screen.queryByText("Glossary")).toBeNull();
  });

  it("shows TM suggestion with score and Apply button for fuzzy matches", () => {
    // Arrange
    const segment: Segment = {
      id: "1",
      source: "Hello world",
      translationMemorySuggestion: "Hola mundo",
      translationMemoryScore: 85,
    };

    // Act
    render(<InspectorPanel segment={segment} onConfirm={onConfirm} />);

    // Assert
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("Hola mundo")).toBeTruthy();
    expect(screen.getByText("Apply")).toBeTruthy();
  });

  it("calls onConfirm with TM suggestion when Apply is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const segment: Segment = {
      id: "seg-1",
      source: "Hello world",
      translationMemorySuggestion: "Hola mundo",
      translationMemoryScore: 85,
    };

    // Act
    render(<InspectorPanel segment={segment} onConfirm={onConfirm} />);
    await user.click(screen.getByText("Apply"));

    // Assert
    expect(onConfirm).toHaveBeenCalledWith("seg-1", "Hola mundo");
  });

  it("shows auto-applied TM status for high-score matches", () => {
    // Arrange
    const segment: Segment = {
      id: "1",
      source: "Hello",
      target: "Hola",
      origin: "translationMemory",
      translationMemoryScore: 100,
    };

    // Act
    render(<InspectorPanel segment={segment} onConfirm={onConfirm} />);

    // Assert
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("Auto-applied from TM")).toBeTruthy();
  });

  it("shows Confirmed status for user-confirmed segments", () => {
    // Arrange
    const segment: Segment = {
      id: "1",
      source: "Hello",
      target: "Hola",
      origin: "user",
    };

    // Act
    render(<InspectorPanel segment={segment} onConfirm={onConfirm} />);

    // Assert
    expect(screen.getByText("Confirmed")).toBeTruthy();
  });

  it("shows AI Translation status for AI-translated segments", () => {
    // Arrange
    const segment: Segment = {
      id: "1",
      source: "Hello",
      target: "Hola",
      origin: "ai",
    };

    // Act
    render(<InspectorPanel segment={segment} onConfirm={onConfirm} />);

    // Assert
    expect(screen.getByText("AI Translation")).toBeTruthy();
  });
});
