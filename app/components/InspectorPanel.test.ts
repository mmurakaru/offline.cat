// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../hooks/useTranslation";
import { InspectorPanel } from "./InspectorPanel";

function renderToContainer(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
}

describe("InspectorPanel", () => {
  const onConfirm = vi.fn();

  afterEach(() => {
    onConfirm.mockClear();
    document.body.innerHTML = "";
  });

  it("shows empty state when no segment is selected", () => {
    const container = renderToContainer(
      createElement(InspectorPanel, { segment: null, onConfirm }),
    );
    expect(container.textContent).toContain("Select a segment");
  });

  it("shows glossary placeholder when segment has no TM or origin", () => {
    const segment: Segment = { id: "1", source: "Hello" };
    const container = renderToContainer(
      createElement(InspectorPanel, { segment, onConfirm }),
    );
    expect(container.textContent).toContain("Glossary");
    expect(container.textContent).toContain("No glossary entries");
  });

  it("shows TM suggestion with score and Apply button for fuzzy matches", () => {
    const segment: Segment = {
      id: "1",
      source: "Hello world",
      translationMemorySuggestion: "Hola mundo",
      translationMemoryScore: 85,
    };
    const container = renderToContainer(
      createElement(InspectorPanel, { segment, onConfirm }),
    );

    expect(container.textContent).toContain("85%");
    expect(container.textContent).toContain("Hola mundo");
    expect(container.textContent).toContain("Apply");
  });

  it("calls onConfirm with TM suggestion when Apply is clicked", () => {
    const segment: Segment = {
      id: "seg-1",
      source: "Hello world",
      translationMemorySuggestion: "Hola mundo",
      translationMemoryScore: 85,
    };
    const container = renderToContainer(
      createElement(InspectorPanel, { segment, onConfirm }),
    );

    const button = container.querySelector("button");
    act(() => {
      button?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith("seg-1", "Hola mundo");
  });

  it("shows auto-applied TM status for high-score matches", () => {
    const segment: Segment = {
      id: "1",
      source: "Hello",
      target: "Hola",
      origin: "translationMemory",
      translationMemoryScore: 100,
    };
    const container = renderToContainer(
      createElement(InspectorPanel, { segment, onConfirm }),
    );

    expect(container.textContent).toContain("100%");
    expect(container.textContent).toContain("Auto-applied from TM");
  });

  it("shows Confirmed status for user-confirmed segments", () => {
    const segment: Segment = {
      id: "1",
      source: "Hello",
      target: "Hola",
      origin: "user",
    };
    const container = renderToContainer(
      createElement(InspectorPanel, { segment, onConfirm }),
    );

    expect(container.textContent).toContain("Confirmed");
  });

  it("shows AI Translation status for AI-translated segments", () => {
    const segment: Segment = {
      id: "1",
      source: "Hello",
      target: "Hola",
      origin: "ai",
    };
    const container = renderToContainer(
      createElement(InspectorPanel, { segment, onConfirm }),
    );

    expect(container.textContent).toContain("AI Translation");
  });
});
