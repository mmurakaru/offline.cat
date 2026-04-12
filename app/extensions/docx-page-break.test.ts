// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { DocxPageBreak } from "./docx-page-break";

describe("DocxPageBreak", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("registers as a block node type", () => {
    editor = new Editor({
      extensions: [StarterKit, DocxPageBreak],
    });

    expect(editor.schema.nodes.docxPageBreak).toBeDefined();
    expect(editor.schema.nodes.docxPageBreak.spec.group).toBe("block");
  });

  it("is an atom node (cannot contain content)", () => {
    editor = new Editor({
      extensions: [StarterKit, DocxPageBreak],
    });

    expect(editor.schema.nodes.docxPageBreak.isAtom).toBe(true);
  });

  it("renders with data-docx-page-break attribute", () => {
    editor = new Editor({
      extensions: [StarterKit, DocxPageBreak],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Before" }] },
          { type: "docxPageBreak" },
          { type: "paragraph", content: [{ type: "text", text: "After" }] },
        ],
      },
    });

    const html = editor.getHTML();
    expect(html).toContain("data-docx-page-break");
    expect(html).toContain("Page_Break");
  });
});
