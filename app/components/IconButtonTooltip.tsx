import type { ReactNode } from "react";
import { Tooltip, TooltipTrigger } from "react-aria-components";

interface IconButtonTooltipProps {
  label: string;
  children: ReactNode;
}

export function IconButtonTooltip({ label, children }: IconButtonTooltipProps) {
  return (
    <TooltipTrigger delay={300}>
      {children}
      <Tooltip
        offset={6}
        className="px-2 py-1 rounded-md bg-grey-9 text-white dark:bg-grey-3 dark:text-grey-9 text-xs shadow-md data-[entering]:animate-in data-[entering]:fade-in data-[exiting]:animate-out data-[exiting]:fade-out"
      >
        {label}
      </Tooltip>
    </TooltipTrigger>
  );
}
