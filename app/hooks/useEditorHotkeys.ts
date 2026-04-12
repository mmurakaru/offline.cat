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
  onDeselect: () => void;
  onConfirm: (segmentId: string, translation: string) => void;
  onTranslate: () => void;
  onSidebarModeChange: (mode: "navigator" | "outline") => void;
  onToggleInspector: () => void;
}

export function useEditorHotkeys({
  segments,
  activeSegmentId,
  isTranslating,
  setZoomPercent,
  onResetView,
  onSegmentClick,
  onDeselect,
  onConfirm,
  onTranslate,
  onSidebarModeChange,
  onToggleInspector,
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

  // Previous segment (Arrow Up)
  useHotkey({ key: "ArrowUp" }, () => {
    if (!activeSegmentId) return;
    const index = segments.findIndex((s) => s.id === activeSegmentId);
    if (index > 0) onSegmentClick(segments[index - 1].id);
  });

  // Next segment (Arrow Down)
  useHotkey({ key: "ArrowDown" }, () => {
    if (!activeSegmentId) return;
    const index = segments.findIndex((s) => s.id === activeSegmentId);
    if (index < segments.length - 1) onSegmentClick(segments[index + 1].id);
  });

  // Next segment (Tab)
  useHotkey({ key: "Tab" }, () => {
    if (!activeSegmentId && segments.length > 0) {
      onSegmentClick(segments[0].id);
      return;
    }
    const index = segments.findIndex((s) => s.id === activeSegmentId);
    if (index < segments.length - 1) onSegmentClick(segments[index + 1].id);
  });

  // Previous segment (Shift+Tab)
  useHotkey({ key: "Tab", shift: true }, () => {
    if (!activeSegmentId) return;
    const index = segments.findIndex((s) => s.id === activeSegmentId);
    if (index > 0) onSegmentClick(segments[index - 1].id);
  });

  // Deselect active segment
  useHotkey({ key: "Escape" }, () => {
    onDeselect();
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

  // Switch sidebar to navigator
  useHotkey({ key: "1", mod: true }, () => {
    onSidebarModeChange("navigator");
  });

  // Switch sidebar to outline
  useHotkey({ key: "2", mod: true }, () => {
    onSidebarModeChange("outline");
  });

  // Toggle inspector panel
  useHotkey({ key: "\\", mod: true }, () => {
    onToggleInspector();
  });
}
