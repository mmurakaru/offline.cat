import { Button } from "react-aria-components";
import type { Segment } from "../hooks/useTranslation";
import { cn } from "../lib/cn";

interface InspectorPanelProps {
  segment: Segment | null;
  onConfirm: (segmentId: string, translation: string) => void;
}

function getMatchBadge(segment: Segment) {
  if (segment.origin === "user")
    return {
      label: "Confirmed",
      className:
        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    };
  if (segment.origin === "translationMemory")
    return {
      label: `TM ${Math.round(segment.translationMemoryScore ?? 100)}%`,
      className:
        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    };
  if (segment.origin === "mt")
    return {
      label: "MT",
      className:
        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    };
  return null;
}

export function InspectorPanel({ segment, onConfirm }: InspectorPanelProps) {
  if (!segment) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-xs text-gray-400">
        Click a text box to inspect
      </div>
    );
  }

  const badge = getMatchBadge(segment);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* Status */}
      {badge && (
        <div>
          <span
            className={cn("text-xs px-2 py-0.5 rounded-full", badge.className)}
          >
            {badge.label}
          </span>
        </div>
      )}

      {/* TM suggestion */}
      {segment.translationMemorySuggestion && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">
            TM suggestion ({Math.round(segment.translationMemoryScore ?? 0)}%)
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
            {segment.translationMemorySuggestion}
          </p>
        </div>
      )}

      {/* Segment info */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">
          Source ({segment.source.split(/\s+/).length} words)
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {segment.source}
        </p>
      </div>

      {/* Actions */}
      {segment.target && segment.origin !== "user" && (
        <Button
          onPress={() => onConfirm(segment.id, segment.target!)}
          className="w-full px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 cursor-pointer"
        >
          Confirm translation
        </Button>
      )}

      {/* Keyboard hints */}
      <div className="text-xs text-gray-400 space-y-1">
        <p>Cmd+Enter - confirm</p>
        <p>Tab - next text box</p>
      </div>
    </div>
  );
}
