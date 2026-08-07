// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../hooks/useTranslation";
import type {
  MarkdownBlock,
  MarkdownFrontmatterField,
} from "../lib/ice/editor-model";
import { MarkdownCanvas } from "./MarkdownCanvas";

const frontmatter: MarkdownFrontmatterField[] = [
  { id: "md-0", key: "name" },
  { id: "md-1", key: "description" },
];

const blocks: MarkdownBlock[] = [
  { id: "md-2", kind: "heading", level: 1 },
  { id: "md-3", kind: "paragraph" },
  { id: "md-4", kind: "listItem" },
];

const segments: Segment[] = [
  { id: "md-0", source: "sample-skill" },
  { id: "md-1", source: "A short skill." },
  { id: "md-2", source: "Sample Skill" },
  { id: "md-3", source: "Body text" },
  { id: "md-4", source: "First item" },
];

function renderCanvas(overrides: Partial<Segment>[] = [], canTranslate = true) {
  const merged = segments.map(
    (segment, index) => ({ ...segment, ...overrides[index] }) as Segment,
  );
  const handlers = {
    onSegmentFocus: vi.fn(),
    onTargetChange: vi.fn(),
    onConfirm: vi.fn(),
    onTranslateSegment: vi.fn(),
  };
  const props = {
    frontmatter,
    blocks,
    activeSegmentId: null,
    canTranslate,
    ...handlers,
  };
  const view = render(<MarkdownCanvas segments={merged} {...props} />);
  const update = (next: Segment[]) =>
    view.rerender(<MarkdownCanvas segments={next} {...props} />);
  return { ...handlers, update };
}

describe("<MarkdownCanvas />", () => {
  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders frontmatter keys as a table", () => {
    renderCanvas();
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText("description")).toBeTruthy();
  });

  it("shows source text as placeholder before translation", () => {
    renderCanvas();
    expect(screen.getByText("Sample Skill")).toBeTruthy();
    expect(screen.getByText("First item")).toBeTruthy();
  });

  it("shows the translated target when present", () => {
    renderCanvas([{}, {}, { target: "Ejemplo" }]);
    expect(screen.getByText("Ejemplo")).toBeTruthy();
  });

  it("reflects external target updates in the open editor", () => {
    const { update } = renderCanvas();

    fireEvent.click(screen.getByText("Body text"));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");

    update(
      segments.map((segment) =>
        segment.id === "md-3" ? { ...segment, target: "Cuerpo MT" } : segment,
      ),
    );

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Cuerpo MT",
    );
  });

  it("enters edit mode and reports target changes", () => {
    const handlers = renderCanvas();

    fireEvent.click(screen.getByText("Body text"));
    expect(handlers.onSegmentFocus).toHaveBeenCalledWith("md-3");

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Cuerpo" } });
    expect(handlers.onTargetChange).toHaveBeenCalledWith("md-3", "Cuerpo");
  });

  it("confirms the segment on Enter", () => {
    const handlers = renderCanvas();

    fireEvent.click(screen.getByText("Sample Skill"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Titulo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handlers.onConfirm).toHaveBeenCalledWith("md-2", "Titulo");
  });

  it("requests machine translation on Ctrl+Enter", () => {
    const handlers = renderCanvas();

    fireEvent.click(screen.getByText("Body text"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

    expect(handlers.onTranslateSegment).toHaveBeenCalledWith("md-3");
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it("does not confirm on Ctrl+Enter when translation is unavailable", () => {
    const handlers = renderCanvas([], false);

    fireEvent.click(screen.getByText("Body text"));
    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Enter",
      ctrlKey: true,
    });

    expect(handlers.onTranslateSegment).not.toHaveBeenCalled();
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });
});
