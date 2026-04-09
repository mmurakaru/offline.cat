import type { Segment } from "../hooks/useTranslation";
import { cn } from "../lib/cn";
import type { SlideLayout } from "../lib/parser-client";

interface OutlineSidebarProps {
  segments: Segment[];
  layouts: SlideLayout[];
  fileType: string;
  activeSegmentId: string | null;
  onSegmentClick: (segmentId: string) => void;
}

function getStatusColor(segment: Segment): string {
  if (segment.origin === "user") return "bg-green-500";
  if (segment.origin === "translationMemory") return "bg-green-400";
  if (segment.origin === "mt") return "bg-gray-400";
  return "bg-gray-300 dark:bg-gray-700";
}

export function OutlineSidebar({
  segments,
  layouts,
  fileType,
  activeSegmentId,
  onSegmentClick,
}: OutlineSidebarProps) {
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));

  // Group segments by slide
  const slideGroups = layouts.map((layout) => ({
    slideIndex: layout.slideIndex,
    segments: layout.regions
      .map((region) => segmentMap.get(region.segmentId))
      .filter(Boolean) as Segment[],
  }));

  // Fallback: if no layouts, show all segments as one group
  const groups =
    slideGroups.length > 0 ? slideGroups : [{ slideIndex: 0, segments }];

  const groupLabel = fileType === "pptx" ? "Slide" : "Page";

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="p-2">
        {groups.map((group) => (
          <div key={group.slideIndex} className="mb-3">
            {groups.length > 1 && (
              <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">
                {groupLabel} {group.slideIndex + 1}
              </div>
            )}
            {group.segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                onClick={() => onSegmentClick(segment.id)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded text-xs cursor-pointer transition-colors flex items-start gap-2",
                  activeSegmentId === segment.id
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                    : "hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300",
                )}
              >
                <span
                  className={cn(
                    "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                    getStatusColor(segment),
                  )}
                />
                <span className="line-clamp-2">{segment.source}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
