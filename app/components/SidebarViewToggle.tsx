import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";

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
        className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-gray-500 dark:text-gray-400 transition-colors"
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="2" width="14" height="12" rx="1.5" />
          <line x1="5.5" y1="2" x2="5.5" y2="14" />
        </svg>
      </Button>
      <Popover className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
        <Menu
          onAction={(key) => onModeChange(key as SidebarMode)}
          className="outline-none"
        >
          <MenuItem
            id="navigator"
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <span className="w-4 text-center">
              {mode === "navigator" ? "✓" : ""}
            </span>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <rect x="1" y="1" width="5" height="4" rx="0.5" />
              <rect x="1" y="6.5" width="5" height="4" rx="0.5" />
              <rect x="8" y="1" width="5" height="4" rx="0.5" />
              <rect x="8" y="6.5" width="5" height="4" rx="0.5" />
            </svg>
            Navigator
          </MenuItem>
          <MenuItem
            id="outline"
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <span className="w-4 text-center">
              {mode === "outline" ? "✓" : ""}
            </span>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <line x1="4" y1="3" x2="12" y2="3" />
              <line x1="4" y1="7" x2="12" y2="7" />
              <line x1="4" y1="11" x2="12" y2="11" />
              <circle cx="2" cy="3" r="0.8" fill="currentColor" />
              <circle cx="2" cy="7" r="0.8" fill="currentColor" />
              <circle cx="2" cy="11" r="0.8" fill="currentColor" />
            </svg>
            Outline
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
