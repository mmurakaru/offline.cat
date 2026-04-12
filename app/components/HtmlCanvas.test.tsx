// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../hooks/useTranslation";
import { HtmlCanvas } from "./HtmlCanvas";

const rawHtml = "<h1>Title</h1><p>Body text</p><p>Another paragraph</p>";

const segments: Segment[] = [
  { id: "html-0", source: "Title" },
  { id: "html-1", source: "Body text" },
  { id: "html-2", source: "Another paragraph" },
];

describe("<HtmlCanvas />", () => {
  const onSegmentFocus = vi.fn();
  const onTargetChange = vi.fn();
  const onConfirm = vi.fn();
  const onTranslateSegment = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders an iframe element", () => {
    const { container } = render(
      <HtmlCanvas
        rawHtml={rawHtml}
        segments={segments}
        activeSegmentId={null}
        onSegmentFocus={onSegmentFocus}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onTranslateSegment={onTranslateSegment}
        canTranslate={true}
      />,
    );

    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("title")).toBe("HTML Preview");
  });

  it("sets sandbox to allow-same-origin for DOM access", () => {
    const { container } = render(
      <HtmlCanvas
        rawHtml={rawHtml}
        segments={segments}
        activeSegmentId={null}
        onSegmentFocus={onSegmentFocus}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onTranslateSegment={onTranslateSegment}
        canTranslate={true}
      />,
    );

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-same-origin");
  });

  it("renders with a white background", () => {
    const { container } = render(
      <HtmlCanvas
        rawHtml={rawHtml}
        segments={segments}
        activeSegmentId={null}
        onSegmentFocus={onSegmentFocus}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onTranslateSegment={onTranslateSegment}
        canTranslate={true}
      />,
    );

    const iframe = container.querySelector("iframe");
    expect(iframe?.classList.contains("bg-white")).toBe(true);
  });
});
