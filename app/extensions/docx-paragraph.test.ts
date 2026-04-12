// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { DocxPageBreak } from "./docx-page-break";
import { DocxParagraph } from "./docx-paragraph";
import { DocxReadOnlyBlock } from "./docx-read-only-block";

function createEditor(content?: object | string) {
  return new Editor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      DocxParagraph,
      DocxPageBreak,
      DocxReadOnlyBlock,
    ],
    content,
  });
}

describe("DocxParagraph", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("registers as the paragraph node type", () => {
    editor = createEditor();
    expect(editor.schema.nodes.paragraph).toBeDefined();
  });

  it("stores segmentId and styling attributes", () => {
    editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            segmentId: "docx-p0",
            alignment: "center",
            fontSize: 14,
            bold: true,
            italic: false,
            color: "#FF0000",
          },
          content: [{ type: "text", text: "Test" }],
        },
      ],
    });

    const node = editor.state.doc.firstChild!;
    expect(node.type.name).toBe("paragraph");
    expect(node.attrs.segmentId).toBe("docx-p0");
    expect(node.attrs.alignment).toBe("center");
    expect(node.attrs.fontSize).toBe(14);
    expect(node.attrs.bold).toBe(true);
    expect(node.attrs.color).toBe("#FF0000");
  });

  it("renders styling as inline styles on p tag", () => {
    editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            segmentId: "docx-p0",
            alignment: "right",
            fontSize: 18,
            bold: true,
          },
          content: [{ type: "text", text: "Styled" }],
        },
      ],
    });

    const html = editor.getHTML();
    expect(html).toContain("text-align: right");
    expect(html).toContain("font-size: 18pt");
    expect(html).toContain("font-weight: bold");
    expect(html).toContain('data-segment-id="docx-p0"');
  });

  it("defaults to no styling when attributes are null", () => {
    editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { segmentId: "docx-p1" },
          content: [{ type: "text", text: "Plain" }],
        },
      ],
    });

    const node = editor.state.doc.firstChild!;
    expect(node.attrs.bold).toBe(false);
    expect(node.attrs.alignment).toBeNull();
    expect(node.attrs.fontSize).toBeNull();
  });
});
