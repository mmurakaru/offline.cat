import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { Segment } from "../hooks/useTranslation";

interface InspectorPanelProps {
  segment: Segment | null;
  onConfirm: (segmentId: string, translation: string) => void;
}

export function InspectorPanel({ segment, onConfirm }: InspectorPanelProps) {
  const { t } = useTranslation();

  if (!segment) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-xs text-grey-6">
        {t("inspector.selectSegment")}
      </div>
    );
  }

  const hasFuzzyMatch =
    segment.translationMemorySuggestion &&
    segment.translationMemoryScore &&
    segment.origin !== "user";

  const hasAppliedTm =
    segment.origin === "translationMemory" && segment.translationMemoryScore;

  const isConfirmed = segment.origin === "user";
  const isAi = segment.origin === "ai";

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* TM fuzzy match - actionable */}
      {hasFuzzyMatch && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-grey-7">
              {t("inspector.translationMemory")}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              {Math.round(segment.translationMemoryScore!)}%
            </span>
          </div>
          <p className="text-xs text-grey-8 dark:text-grey-6 mb-2">
            {segment.translationMemorySuggestion}
          </p>
          <Button
            onPress={() =>
              onConfirm(segment.id, segment.translationMemorySuggestion!)
            }
            className="w-full px-3 py-1.5 text-xs font-medium bg-primary-5 text-white rounded-md hover:bg-primary-6 cursor-pointer transition-colors"
          >
            {t("inspector.apply")}
          </Button>
        </div>
      )}

      {/* TM auto-applied */}
      {hasAppliedTm && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-grey-7">
              {t("inspector.translationMemory")}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              {Math.round(segment.translationMemoryScore!)}%
            </span>
          </div>
          <p className="text-xs text-grey-6">{t("inspector.autoApplied")}</p>
        </div>
      )}

      {/* Confirmed by user */}
      {isConfirmed && (
        <div>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
            {t("inspector.confirmed")}
          </span>
        </div>
      )}

      {/* AI translation */}
      {isAi && (
        <div>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-grey-3 text-grey-8 dark:bg-grey-15 dark:text-grey-6">
            {t("inspector.aiTranslation")}
          </span>
        </div>
      )}

      {/* TODO: Glossary - add when glossary DB infra is built */}
    </div>
  );
}
