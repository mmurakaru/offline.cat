import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import {
  SlashCommandMenu,
  type SlashCommandMenuRef,
} from "../components/SlashCommandMenu";
import type { CommandCallbacks, SlashCommand } from "../lib/slash-commands";
import {
  executeCommand,
  filterCommands,
  getSlashCommands,
} from "../lib/slash-commands";

export function createSlashCommandSuggestion(
  callbacks: CommandCallbacks,
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "/",
    startOfLine: false,

    items: ({ query }) => {
      const canTranslate = callbacks.canTranslate?.() ?? true;
      return filterCommands(getSlashCommands({ canTranslate }), query);
    },

    command: ({ editor, range, props }) => {
      editor.chain().focus().deleteRange(range).run();
      executeCommand(props.id, callbacks);
    },

    render: () => {
      let component: ReactRenderer<SlashCommandMenuRef> | null = null;
      let anchorElement: HTMLDivElement | null = null;
      let popoverElement: HTMLDivElement | null = null;

      let editorView: {
        coordsAtPos: (pos: number) => {
          top: number;
          left: number;
          bottom: number;
        };
      } | null = null;
      let decorationPos = 0;
      let rafId = 0;

      function updateAnchorPosition() {
        if (!anchorElement || !editorView) return;
        try {
          const coords = editorView.coordsAtPos(decorationPos);
          anchorElement.style.top = `${coords.top}px`;
          anchorElement.style.left = `${coords.left}px`;
          anchorElement.style.width = "0px";
          anchorElement.style.height = `${coords.bottom - coords.top}px`;
        } catch {
          // Position may be invalid if editor content changed
        }
      }

      function trackPosition() {
        updateAnchorPosition();
        rafId = requestAnimationFrame(trackPosition);
      }

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(SlashCommandMenu, {
            props: {
              items: props.items,
              command: (item: SlashCommand) => {
                props.command(item);
              },
            },
            editor: props.editor,
          }) as ReactRenderer<SlashCommandMenuRef>;

          // Invisible anchor element tracks cursor position
          anchorElement = document.createElement("div");
          anchorElement.style.position = "fixed";
          anchorElement.style.pointerEvents = "none";
          anchorElement.style.setProperty("anchor-name", "--slash-cursor");
          document.body.appendChild(anchorElement);

          // Popover anchored to the cursor with flip fallback
          popoverElement = document.createElement("div");
          popoverElement.setAttribute("popover", "auto");
          popoverElement.style.margin = "0";
          popoverElement.style.padding = "0";
          popoverElement.style.border = "none";
          popoverElement.style.background = "none";
          popoverElement.style.overflow = "visible";
          popoverElement.style.inset = "unset";
          popoverElement.style.setProperty("position-anchor", "--slash-cursor");
          popoverElement.style.setProperty(
            "position-area",
            "bottom span-right",
          );
          popoverElement.style.setProperty(
            "position-try-fallbacks",
            "flip-block, flip-inline, flip-block flip-inline",
          );
          popoverElement.appendChild(component.element);
          document.body.appendChild(popoverElement);

          editorView = props.editor.view;
          decorationPos = props.range.from;
          updateAnchorPosition();
          trackPosition();
          popoverElement.showPopover();
        },

        onUpdate: (props: SuggestionProps) => {
          component?.updateProps({
            items: props.items,
            command: (item: SlashCommand) => {
              props.command(item);
            },
          });
          decorationPos = props.range.from;
          updateAnchorPosition();
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            popoverElement?.hidePopover();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          cancelAnimationFrame(rafId);
          popoverElement?.hidePopover();
          popoverElement?.remove();
          anchorElement?.remove();
          component?.destroy();
        },
      };
    },
  };
}
