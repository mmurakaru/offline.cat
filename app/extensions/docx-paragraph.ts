import { mergeAttributes, Node } from "@tiptap/react";

export interface DocxParagraphAttributes {
  segmentId: string | null;
  alignment: string | null;
  fontSize: number | null;
  bold: boolean;
  italic: boolean;
  color: string | null;
  fontFamily: string | null;
  spacingBefore: number | null;
  spacingAfter: number | null;
  indentLeft: number | null;
}

export const DocxParagraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      segmentId: { default: null },
      alignment: { default: null },
      fontSize: { default: null },
      bold: { default: false },
      italic: { default: false },
      color: { default: null },
      fontFamily: { default: null },
      spacingBefore: { default: null },
      spacingAfter: { default: null },
      indentLeft: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "p[data-segment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const style: string[] = [];

    if (HTMLAttributes.alignment) {
      style.push(`text-align: ${HTMLAttributes.alignment}`);
    }
    if (HTMLAttributes.fontSize) {
      style.push(`font-size: ${HTMLAttributes.fontSize}pt`);
    }
    if (HTMLAttributes.bold) {
      style.push("font-weight: bold");
    }
    if (HTMLAttributes.italic) {
      style.push("font-style: italic");
    }
    if (HTMLAttributes.color) {
      style.push(`color: ${HTMLAttributes.color}`);
    }
    if (HTMLAttributes.fontFamily) {
      style.push(`font-family: ${HTMLAttributes.fontFamily}`);
    }
    if (HTMLAttributes.spacingBefore) {
      style.push(`margin-top: ${HTMLAttributes.spacingBefore}pt`);
    }
    if (HTMLAttributes.spacingAfter) {
      style.push(`margin-bottom: ${HTMLAttributes.spacingAfter}pt`);
    }
    if (HTMLAttributes.indentLeft) {
      style.push(`padding-left: ${HTMLAttributes.indentLeft}pt`);
    }

    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-segment-id": HTMLAttributes.segmentId,
        style: style.join("; "),
      }),
      0,
    ];
  },
});
