import type { Segment } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import type { SlideLayout } from "../lib/parser-client";
import { SlideThumbnail } from "./SlideThumbnail";

interface NavigatorSidebarProps {
  layouts: SlideLayout[];
  segments: Segment[];
  activeSlide: number;
  imageUrls?: Map<string, string>;
  onSlideClick: (slideIndex: number) => void;
}

export function NavigatorSidebar({
  layouts,
  segments,
  activeSlide,
  imageUrls,
  onSlideClick,
}: NavigatorSidebarProps) {
  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="p-2 flex flex-col gap-2">
        {layouts.map((layout, index) => (
          <button
            key={layout.slideIndex}
            type="button"
            onClick={() => onSlideClick(index)}
            className={cn(
              "flex items-end gap-2 cursor-pointer group rounded-r-lg rounded-tl-[14px_12px] rounded-bl-[14px_12px] px-1 py-1 transition-colors duration-200",
              index === activeSlide && "bg-blue-500 dark:bg-blue-500",
            )}
          >
            <span
              className={cn(
                "text-xs font-medium pb-0.5 w-5 text-right shrink-0",
                index === activeSlide
                  ? "text-white"
                  : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300",
              )}
            >
              {index + 1}
            </span>
            <div
              className={cn(
                "rounded overflow-hidden shadow-sm",
                index !== activeSlide &&
                  "ring-1 ring-gray-200 dark:ring-gray-700",
              )}
            >
              <SlideThumbnail
                layout={layout}
                segments={segments}
                imageUrls={imageUrls}
                width={170}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
