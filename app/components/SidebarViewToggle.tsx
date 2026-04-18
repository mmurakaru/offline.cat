import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { IconButtonTooltip } from "./IconButtonTooltip";
import { LayoutIcon } from "./icons/layout-icon";
import { NumberedListIcon } from "./icons/numbered-list-icon";
import { PreviewIcon } from "./icons/preview-icon";
import { SidebarIcon } from "./icons/sidebar-icon";

export type SidebarMode = "navigator" | "outline" | "preview";

interface SidebarViewToggleProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  fileType: string;
}

function getPreviewLabelKey(fileType: string): string {
  switch (fileType) {
    case "pptx":
      return "sidebar.slideOnly";
    case "docx":
      return "sidebar.pageOnly";
    default:
      return "sidebar.previewOnly";
  }
}

export function SidebarViewToggle({
  mode,
  onModeChange,
  fileType,
}: SidebarViewToggleProps) {
  const { t } = useTranslation();
  const hasThumbnails = fileType === "pptx";
  const previewLabel = t(getPreviewLabelKey(fileType));

  return (
    <MenuTrigger>
      <IconButtonTooltip label={t("sidebar.view")}>
        <Button
          aria-label={t("sidebar.view")}
          className="p-2 rounded-lg hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 cursor-pointer text-grey-7 dark:text-grey-6 transition-colors"
        >
          <SidebarIcon />
        </Button>
      </IconButtonTooltip>
      <Popover className="bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider rounded-lg shadow-lg py-1 min-w-[160px]">
        <Menu
          onAction={(key) => onModeChange(key as SidebarMode)}
          className="outline-none"
        >
          {hasThumbnails && (
            <MenuItem
              id="navigator"
              className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4"
            >
              <span className="w-4 text-center">
                {mode === "navigator" ? "✓" : ""}
              </span>
              <LayoutIcon />
              {t("sidebar.navigator")}
            </MenuItem>
          )}
          <MenuItem
            id="outline"
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4"
          >
            <span className="w-4 text-center">
              {mode === "outline" ? "✓" : ""}
            </span>
            <NumberedListIcon />
            {t("sidebar.outline")}
          </MenuItem>
          <MenuItem
            id="preview"
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none hover:bg-grey-3 dark:hover:bg-grey-15 text-grey-9 dark:text-grey-4"
          >
            <span className="w-4 text-center">
              {mode === "preview" ? "✓" : ""}
            </span>
            <PreviewIcon />
            {previewLabel}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
