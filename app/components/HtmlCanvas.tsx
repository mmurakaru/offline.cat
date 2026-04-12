import { useEffect, useMemo, useRef } from "react";
import type { Segment } from "../hooks/useTranslation";
import { preprocessHtml } from "../lib/html-preprocessor";

interface HtmlCanvasProps {
  rawHtml: string;
  segments: Segment[];
  activeSegmentId: string | null;
  onSegmentFocus: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
  onTranslateSegment: (segmentId: string) => void;
  canTranslate: boolean;
}

export function HtmlCanvas({
  rawHtml,
  segments,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  onTranslateSegment,
  canTranslate,
}: HtmlCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isExternalUpdate = useRef(false);

  const segmentMap = useMemo(
    () => new Map(segments.map((segment) => [segment.id, segment])),
    [segments],
  );

  const callbacksRef = useRef({
    onTargetChange,
    onSegmentFocus,
    onConfirm,
    onTranslateSegment,
    canTranslate,
    segmentMap,
  });
  callbacksRef.current = {
    onTargetChange,
    onSegmentFocus,
    onConfirm,
    onTranslateSegment,
    canTranslate,
    segmentMap,
  };

  const preprocessed = useMemo(() => preprocessHtml(rawHtml), [rawHtml]);

  // Build the iframe srcdoc with the preprocessed HTML + injected styles for
  // segment highlighting and contenteditable behavior
  const srcdoc = useMemo(() => {
    const segmentStyles = `
      [data-segment-id] {
        outline: 1px solid transparent;
        outline-offset: 1px;
        border-radius: 2px;
        cursor: text;
        transition: outline-color 0.15s;
      }
      [data-segment-id]:hover {
        outline-color: rgba(120, 120, 120, 0.3);
      }
      [data-segment-id]:focus {
        outline: 2px solid #6366f1;
        outline-offset: 1px;
      }
      [data-segment-id][data-confirmed="true"] {
        outline: 1px solid rgba(74, 222, 128, 0.5);
      }
      [data-segment-id]:empty::before {
        content: attr(data-placeholder);
        color: #9ca3af;
        pointer-events: none;
      }
    `;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${segmentStyles}</style>
</head>
<body>
${preprocessed.html}
</body>
</html>`;
  }, [preprocessed.html]);

  // Set up the iframe content and event listeners
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      // Make all segment spans contenteditable with placeholders
      const spans = doc.querySelectorAll("[data-segment-id]");
      for (const span of spans) {
        const el = span as HTMLElement;
        const segmentId = el.getAttribute("data-segment-id")!;
        el.contentEditable = "true";
        el.spellcheck = false;

        // Set placeholder from source text
        const segment = callbacksRef.current.segmentMap.get(segmentId);
        if (segment) {
          el.setAttribute("data-placeholder", segment.source);
        }

        // Populate with target if available
        if (segment?.target) {
          el.textContent = segment.target;
        }

        // Mark confirmed segments
        if (segment?.origin === "user") {
          el.setAttribute("data-confirmed", "true");
        }
      }

      // Attach event listeners
      doc.addEventListener("input", (event) => {
        if (isExternalUpdate.current) return;
        const target = event.target as HTMLElement;
        const segmentId = target.getAttribute?.("data-segment-id");
        if (segmentId) {
          callbacksRef.current.onTargetChange(
            segmentId,
            target.textContent ?? "",
          );
        }
      });

      doc.addEventListener("focusin", (event) => {
        const target = event.target as HTMLElement;
        const segmentId = target.getAttribute?.("data-segment-id");
        if (segmentId) {
          callbacksRef.current.onSegmentFocus(segmentId);
        }
      });

      doc.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          const target = event.target as HTMLElement;
          const segmentId = target.getAttribute?.("data-segment-id");
          if (segmentId && target.textContent) {
            callbacksRef.current.onConfirm(segmentId, target.textContent);
          }
        }
      });
    };

    iframe.addEventListener("load", handleLoad);

    // Write the srcdoc
    iframe.srcdoc = srcdoc;

    return () => {
      iframe.removeEventListener("load", handleLoad);
    };
  }, [srcdoc]);

  // Sync external changes (MT, TM, confirm) into the iframe
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    isExternalUpdate.current = true;
    for (const segment of segments) {
      const el = doc.querySelector(
        `[data-segment-id="${segment.id}"]`,
      ) as HTMLElement | null;
      if (!el) continue;

      // Update text content if changed externally
      if (segment.target && el.textContent !== segment.target) {
        el.textContent = segment.target;
      }

      // Update confirmed state
      if (segment.origin === "user") {
        el.setAttribute("data-confirmed", "true");
      } else {
        el.removeAttribute("data-confirmed");
      }
    }
    isExternalUpdate.current = false;
  }, [segments]);

  // Highlight active segment in iframe
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    // Remove previous active highlight
    const prevActive = doc.querySelector("[data-segment-active]");
    if (prevActive) {
      prevActive.removeAttribute("data-segment-active");
      (prevActive as HTMLElement).style.outline = "";
    }

    // Set new active highlight
    if (activeSegmentId) {
      const el = doc.querySelector(
        `[data-segment-id="${activeSegmentId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.setAttribute("data-segment-active", "true");
        el.style.outline = "2px solid #6366f1";
      }
    }
  }, [activeSegmentId]);

  return (
    <div className="h-full overflow-hidden">
      <iframe
        ref={iframeRef}
        title="HTML Preview"
        className="w-full h-full border-0 bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
