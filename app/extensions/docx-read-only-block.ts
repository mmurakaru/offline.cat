import { Node } from "@tiptap/react";

export const DocxReadOnlyBlock = Node.create({
  name: "docxReadOnlyBlock",
  group: "block",
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      blockType: { default: "image" },
      imageSrc: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-docx-readonly]" }];
  },

  renderHTML({ HTMLAttributes }) {
    if (HTMLAttributes.blockType === "image" && HTMLAttributes.imageSrc) {
      return [
        "div",
        {
          "data-docx-readonly": "",
          "data-block-type": "image",
          class: "my-2 flex justify-center select-none",
          contenteditable: "false",
        },
        [
          "img",
          {
            src: HTMLAttributes.imageSrc,
            alt: "",
            style: "max-width: 100%; height: auto;",
          },
        ],
      ];
    }

    const label = HTMLAttributes.blockType === "table" ? "Table" : "Image";
    const icon = HTMLAttributes.blockType === "table" ? "\u2637" : "\u2BC0";

    return [
      "div",
      {
        "data-docx-readonly": "",
        "data-block-type": HTMLAttributes.blockType,
        class:
          "border border-dashed border-grey-5 rounded bg-grey-2 dark:bg-grey-16 my-2 py-4 flex items-center justify-center gap-2 text-grey-6 text-sm select-none",
        contenteditable: "false",
      },
      ["span", {}, `${icon} ${label}`],
    ];
  },
});
