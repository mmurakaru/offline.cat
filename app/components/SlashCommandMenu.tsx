import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SlashCommand } from "../lib/slash-commands";

interface SlashCommandMenuProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

export interface SlashCommandMenuRef {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandMenu = forwardRef<
  SlashCommandMenuRef,
  SlashCommandMenuProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div className="bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider rounded-lg shadow-lg py-1 min-w-[180px] overflow-hidden">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => command(item)}
          className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer transition-colors ${
            index === selectedIndex
              ? "bg-primary-5/10 text-primary-5 dark:text-primary-1"
              : "text-grey-9 dark:text-grey-4 hover:bg-grey-3 dark:hover:bg-grey-15"
          }`}
        >
          <div className="font-medium">/{item.id}</div>
          <div className="text-xs text-grey-6">{item.description}</div>
        </button>
      ))}
    </div>
  );
});
