import { Node } from "@tiptap/react";

export const DocxPageBreak = Node.create({
  name: "docxPageBreak",
  group: "block",
  atom: true,
  selectable: false,

  parseHTML() {
    return [{ tag: "div[data-docx-page-break]" }];
  },

  renderHTML() {
    return [
      "div",
      {
        "data-docx-page-break": "",
        class:
          "border-t border-dashed border-grey-6 my-6 relative after:content-['Page_Break'] after:absolute after:top-1/2 after:-translate-y-1/2 after:left-1/2 after:-translate-x-1/2 after:bg-grey-2 after:dark:bg-grey-15 after:px-2 after:text-xs after:text-grey-6",
        contenteditable: "false",
      },
    ];
  },
});
