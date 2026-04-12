import { useHotkey } from "@tanstack/react-hotkeys";
import type { Dispatch, SetStateAction } from "react";
import type { Segment } from "./useTranslation";

interface EditorHotkeysOptions {
  segments: Segment[];
  activeSegmentId: string | null;
  isTranslating: boolean;
  setZoomPercent: Dispatch<SetStateAction<number | "fit">>;
  onResetView: () => void;
  onSegmentClick: (segmentId: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
  onTranslate: () => void;
}

export function useEditorHotkeys({
  segments,
  activeSegmentId,
  isTranslating,
  setZoomPercent,
  onResetView,
  onSegmentClick,
  onConfirm,
  onTranslate,
}: EditorHotkeysOptions) {
  // Zoom in
  useHotkey({ key: "=", mod: true }, () => {
    setZoomPercent((prev) => {
      const current = prev === "fit" ? 100 : prev;
      return Math.min(400, current + 25);
    });
  });

  // Zoom out
  useHotkey({ key: "-", mod: true }, () => {
    setZoomPercent((prev) => {
      const current = prev === "fit" ? 100 : prev;
      return Math.max(10, current - 25);
    });
  });

  // Fit slide and reset pan
  useHotkey({ key: "0", mod: true }, () => {
    setZoomPercent("fit");
    onResetView();
  });

  // Previous segment
  useHotkey({ key: "ArrowUp" }, () => {
    if (!activeSegmentId) return;
    const index = segments.findIndex((s) => s.id === activeSegmentId);
    if (index > 0) onSegmentClick(segments[index - 1].id);
  });

  // Next segment
  useHotkey({ key: "ArrowDown" }, () => {
    if (!activeSegmentId) return;
    const index = segments.findIndex((s) => s.id === activeSegmentId);
    if (index < segments.length - 1) onSegmentClick(segments[index + 1].id);
  });

  // Confirm translation
  useHotkey({ key: "Enter", mod: true }, () => {
    if (!activeSegmentId) return;
    const segment = segments.find((s) => s.id === activeSegmentId);
    if (segment?.target && segment.origin !== "user") {
      onConfirm(segment.id, segment.target);
    }
  });

  // Translate all
  useHotkey({ key: "Enter", shift: true }, () => {
    if (!isTranslating) onTranslate();
  });
}
