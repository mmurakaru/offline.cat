// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../hooks/useTranslation";
import type { DocxDocumentLayout } from "../lib/parsers/docx";
import { DocumentCanvas } from "./DocumentCanvas";

const layout: DocxDocumentLayout = {
  pageDimensions: {
    widthPt: 612,
    heightPt: 792,
    marginTopPt: 72,
    marginBottomPt: 72,
    marginLeftPt: 90,
    marginRightPt: 90,
  },
  blocks: [
    {
      type: "paragraph",
      segmentId: "docx-p0",
      text: "Hello world",
      paragraphStyle: { alignment: "left" },
      dominantRunStyle: { bold: true, sizePoints: 14 },
    },
    { type: "pageBreak" },
    {
      type: "paragraph",
      segmentId: "docx-p1",
      text: "Second paragraph",
      paragraphStyle: {},
      dominantRunStyle: {},
    },
  ],
};

const segments: Segment[] = [
  { id: "docx-p0", source: "Hello world" },
  { id: "docx-p1", source: "Second paragraph" },
];

describe("<DocumentCanvas />", () => {
  const onSegmentFocus = vi.fn();
  const onTargetChange = vi.fn();
  const onConfirm = vi.fn();
  const onTranslateSegment = vi.fn();
  const onZoomChange = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders paragraph text from the layout", () => {
    render(
      <DocumentCanvas
        layout={layout}
        segments={segments}
        activeSegmentId={null}
        onSegmentFocus={onSegmentFocus}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onTranslateSegment={onTranslateSegment}
        canTranslate={true}
        zoomPercent="fit"
        onZoomChange={onZoomChange}
      />,
    );

    expect(screen.getByText("Hello world")).toBeTruthy();
    expect(screen.getByText("Second paragraph")).toBeTruthy();
  });

  it("renders the zoom control", () => {
    render(
      <DocumentCanvas
        layout={layout}
        segments={segments}
        activeSegmentId={null}
        onSegmentFocus={onSegmentFocus}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onTranslateSegment={onTranslateSegment}
        canTranslate={true}
        zoomPercent="fit"
        onZoomChange={onZoomChange}
      />,
    );

    expect(screen.getByText("Fit Page")).toBeTruthy();
  });

  it("renders with a white background page container", () => {
    const { container } = render(
      <DocumentCanvas
        layout={layout}
        segments={segments}
        activeSegmentId={null}
        onSegmentFocus={onSegmentFocus}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onTranslateSegment={onTranslateSegment}
        canTranslate={true}
        zoomPercent={100}
        onZoomChange={onZoomChange}
      />,
    );

    const pageDiv = container.querySelector(
      "[style*='background-color']",
    ) as HTMLElement;
    expect(pageDiv).toBeTruthy();
    expect(pageDiv.style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  it("shows segment target text when available", () => {
    const translatedSegments: Segment[] = [
      { id: "docx-p0", source: "Hello world", target: "Hola mundo" },
      { id: "docx-p1", source: "Second paragraph" },
    ];

    render(
      <DocumentCanvas
        layout={layout}
        segments={translatedSegments}
        activeSegmentId={null}
        onSegmentFocus={onSegmentFocus}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onTranslateSegment={onTranslateSegment}
        canTranslate={true}
        zoomPercent="fit"
        onZoomChange={onZoomChange}
      />,
    );

    expect(screen.getByText("Hola mundo")).toBeTruthy();
    expect(screen.getByText("Second paragraph")).toBeTruthy();
  });
});
