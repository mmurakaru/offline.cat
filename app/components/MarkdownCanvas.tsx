import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Segment } from "../hooks/useTranslation";
import type {
  MarkdownBlock,
  MarkdownFrontmatterField,
} from "../lib/ice/editor-model";
import "./MarkdownCanvas.css";

interface MarkdownCanvasProps {
  frontmatter: MarkdownFrontmatterField[];
  blocks: MarkdownBlock[];
  segments: Segment[];
  activeSegmentId: string | null;
  onSegmentFocus: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onConfirm: (segmentId: string, translation: string) => void;
  onTranslateSegment: (segmentId: string) => void;
  canTranslate: boolean;
}

const INLINE_TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  function pushText(value: string) {
    key += 1;
    nodes.push(<Fragment key={key}>{value}</Fragment>);
  }

  while (remaining.length > 0) {
    const match = remaining.match(INLINE_TOKEN);
    if (!match || match.index === undefined) {
      pushText(remaining);
      break;
    }

    if (match.index > 0) pushText(remaining.slice(0, match.index));

    const token = match[0];
    key += 1;
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2))}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1))}</em>);
    } else {
      // Links render as non-navigable text: the preview is an editor surface,
      // and this keeps untrusted hrefs (e.g. javascript:) out of the app origin.
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        <span key={key} className="mdc-link">
          {link?.[1]}
        </span>,
      );
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return nodes;
}

export function MarkdownCanvas({
  frontmatter,
  blocks,
  segments,
  activeSegmentId,
  onSegmentFocus,
  onTargetChange,
  onConfirm,
  onTranslateSegment,
  canTranslate,
}: MarkdownCanvasProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSyncedValueRef = useRef("");

  const segmentMap = useMemo(
    () => new Map(segments.map((segment) => [segment.id, segment])),
    [segments],
  );

  const editableIds = useMemo(
    () => [
      ...frontmatter.map((field) => field.id),
      ...blocks.map((block) => block.id),
    ],
    [frontmatter, blocks],
  );

  useEffect(
    function focusEditingInput() {
      if (editingId === null) return;
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    },
    [editingId],
  );

  useEffect(
    function syncExternalTarget() {
      if (editingId === null) return;
      const target = segmentMap.get(editingId)?.target ?? "";
      if (target !== lastSyncedValueRef.current) {
        lastSyncedValueRef.current = target;
        setEditingValue(target);
      }
    },
    [editingId, segmentMap],
  );

  function displayValue(segmentId: string): string {
    const segment = segmentMap.get(segmentId);
    return segment?.target?.length ? segment.target : (segment?.source ?? "");
  }

  function isPlaceholder(segmentId: string): boolean {
    const segment = segmentMap.get(segmentId);
    return !segment?.target?.length;
  }

  function beginEditing(segmentId: string) {
    const segment = segmentMap.get(segmentId);
    lastSyncedValueRef.current = segment?.target ?? "";
    setEditingId(segmentId);
    setEditingValue(segment?.target ?? "");
    onSegmentFocus(segmentId);
  }

  function stopEditing() {
    setEditingId(null);
  }

  function moveEditing(fromId: string, direction: 1 | -1) {
    const currentIndex = editableIds.indexOf(fromId);
    const nextId = editableIds[currentIndex + direction];
    if (nextId) beginEditing(nextId);
  }

  function handleChange(segmentId: string, value: string) {
    lastSyncedValueRef.current = value;
    setEditingValue(value);
    onTargetChange(segmentId, value);
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    segmentId: string,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      stopEditing();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveEditing(segmentId, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveEditing(segmentId, -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        if (canTranslate) onTranslateSegment(segmentId);
        return;
      }
      onConfirm(segmentId, editingValue);
      moveEditing(segmentId, 1);
    }
  }

  const editingBlockIndex =
    editingId === null
      ? -1
      : blocks.findIndex((block) => block.id === editingId);

  function gutterLabel(index: number): string {
    if (editingBlockIndex === -1) return "";
    if (index === editingBlockIndex) return String(index + 1);
    return String(Math.abs(index - editingBlockIndex));
  }

  const bodyEditing = editingBlockIndex !== -1;

  function renderInput(segmentId: string) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="mdc-input"
        value={editingValue}
        placeholder={segmentMap.get(segmentId)?.source ?? ""}
        onChange={(event) => handleChange(segmentId, event.target.value)}
        onKeyDown={(event) => handleKeyDown(event, segmentId)}
        onFocus={() => onSegmentFocus(segmentId)}
        spellCheck={false}
      />
    );
  }

  function renderBlockContent(block: MarkdownBlock) {
    const content = renderInline(displayValue(block.id));
    if (block.kind === "heading") {
      return (
        <span className={`mdc-heading mdc-h${block.level ?? 1}`}>
          {content}
        </span>
      );
    }
    if (block.kind === "listItem") {
      return (
        <span className="mdc-list-item">
          <span className="mdc-bullet">&bull;</span>
          <span>{content}</span>
        </span>
      );
    }
    return <span>{content}</span>;
  }

  return (
    <div className="mdc-root h-full overflow-auto bg-white text-black">
      {frontmatter.length > 0 && (
        <div className="mdc-frontmatter">
          <table className="mdc-fm-table">
            <tbody>
              {frontmatter.map((field) => (
                <tr key={field.id}>
                  <td className="mdc-fm-key">{field.key}</td>
                  <td
                    className={
                      field.id === activeSegmentId
                        ? "mdc-fm-value mdc-active"
                        : "mdc-fm-value"
                    }
                  >
                    {editingId === field.id ? (
                      renderInput(field.id)
                    ) : (
                      <button
                        type="button"
                        className={
                          isPlaceholder(field.id)
                            ? "mdc-cell mdc-placeholder"
                            : "mdc-cell"
                        }
                        onClick={() => beginEditing(field.id)}
                      >
                        {displayValue(field.id)}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mdc-body" data-editing={bodyEditing}>
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className={
              block.id === activeSegmentId ? "mdc-line mdc-active" : "mdc-line"
            }
          >
            <span className="mdc-gutter">{gutterLabel(index)}</span>
            <div className="mdc-content">
              {editingId === block.id ? (
                renderInput(block.id)
              ) : (
                <button
                  type="button"
                  className={
                    isPlaceholder(block.id)
                      ? "mdc-cell mdc-placeholder"
                      : "mdc-cell"
                  }
                  onClick={() => beginEditing(block.id)}
                >
                  {renderBlockContent(block)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
