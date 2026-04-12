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
    <div className="h-full overflow-y-auto no-scrollbar bg-grey-1 dark:bg-ui-app-background scroll-fade">
      <div className="p-2 flex flex-col gap-2">
        {layouts.map((layout, index) => (
          <button
            key={layout.slideIndex}
            type="button"
            onClick={() => onSlideClick(index)}
            className={cn(
              "flex items-end gap-2 cursor-pointer group rounded-r-lg rounded-tl-2xl rounded-bl-2xl [corner-shape:squircle] px-1 py-1 transition-colors duration-200",
              index === activeSlide && "bg-primary-5 dark:bg-primary-5",
            )}
          >
            <span
              className={cn(
                "text-xs font-medium pb-0.5 w-5 text-right shrink-0",
                index === activeSlide
                  ? "text-white"
                  : "text-grey-6 group-hover:text-grey-8 dark:group-hover:text-grey-4",
              )}
            >
              {index + 1}
            </span>
            <div
              className={cn(
                "rounded overflow-hidden shadow-sm",
                index !== activeSlide &&
                  "ring-1 ring-grey-3 dark:ring-ui-divider",
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
