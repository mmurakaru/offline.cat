// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { DocxReadOnlyBlock } from "./docx-read-only-block";

describe("DocxReadOnlyBlock", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("registers as a block atom node", () => {
    editor = new Editor({
      extensions: [StarterKit, DocxReadOnlyBlock],
    });

    expect(editor.schema.nodes.docxReadOnlyBlock).toBeDefined();
    expect(editor.schema.nodes.docxReadOnlyBlock.isAtom).toBe(true);
  });

  it("renders a table placeholder for blockType table", () => {
    editor = new Editor({
      extensions: [StarterKit, DocxReadOnlyBlock],
      content: {
        type: "doc",
        content: [{ type: "docxReadOnlyBlock", attrs: { blockType: "table" } }],
      },
    });

    const html = editor.getHTML();
    expect(html).toContain('data-block-type="table"');
    expect(html).toContain("Table");
  });

  it("renders an image placeholder when no imageSrc", () => {
    editor = new Editor({
      extensions: [StarterKit, DocxReadOnlyBlock],
      content: {
        type: "doc",
        content: [{ type: "docxReadOnlyBlock", attrs: { blockType: "image" } }],
      },
    });

    const html = editor.getHTML();
    expect(html).toContain('data-block-type="image"');
    expect(html).toContain("Image");
  });

  it("renders an img tag when imageSrc is provided", () => {
    editor = new Editor({
      extensions: [StarterKit, DocxReadOnlyBlock],
      content: {
        type: "doc",
        content: [
          {
            type: "docxReadOnlyBlock",
            attrs: { blockType: "image", imageSrc: "blob:test-url" },
          },
        ],
      },
    });

    const html = editor.getHTML();
    expect(html).toContain("<img");
    expect(html).toContain("blob:test-url");
  });
});
