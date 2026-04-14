import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

export function LocaleSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();

  return (
    <ToggleButtonGroup
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([i18n.language])}
      onSelectionChange={(keys) => {
        const locale = [...keys][0] as string;
        i18n.changeLanguage(locale);
        localStorage.setItem("locale", locale);
      }}
      className={cn("flex gap-0.5", className)}
    >
      <ToggleButton
        id="en"
        className={({ isSelected }) =>
          cn(
            "w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold leading-none cursor-pointer transition-colors outline-none",
            isSelected
              ? "bg-primary-5 text-white"
              : "text-grey-6 hover:text-grey-8 dark:hover:text-grey-4 hover:bg-grey-3 dark:hover:bg-grey-15",
          )
        }
      >
        EN
      </ToggleButton>
      <ToggleButton
        id="ca"
        className={({ isSelected }) =>
          cn(
            "w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold leading-none cursor-pointer transition-colors outline-none",
            isSelected
              ? "bg-primary-5 text-white"
              : "text-grey-6 hover:text-grey-8 dark:hover:text-grey-4 hover:bg-grey-3 dark:hover:bg-grey-15",
          )
        }
      >
        CA
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
