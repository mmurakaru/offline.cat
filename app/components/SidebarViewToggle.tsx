import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { LayoutIcon } from "./layout-icon";
import { NumberedListIcon } from "./numbered-list-icon";
import { SidebarIcon } from "./sidebar-icon";

export type SidebarMode = "navigator" | "outline";

interface SidebarViewToggleProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
}

export function SidebarViewToggle({
  mode,
  onModeChange,
}: SidebarViewToggleProps) {
  return (
    <MenuTrigger>
      <Button
        aria-label="Sidebar view"
        className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors"
      >
        <SidebarIcon />
      </Button>
      <Popover className="bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider rounded-lg shadow-lg py-1 min-w-[160px]">
        <Menu
          onAction={(key) => onModeChange(key as SidebarMode)}
          className="outline-none"
        >
          <MenuItem
            id="navigator"
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4"
          >
            <span className="w-4 text-center">
              {mode === "navigator" ? "✓" : ""}
            </span>
            <LayoutIcon />
            Navigator
          </MenuItem>
          <MenuItem
            id="outline"
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4"
          >
            <span className="w-4 text-center">
              {mode === "outline" ? "✓" : ""}
            </span>
            <NumberedListIcon />
            Outline
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
