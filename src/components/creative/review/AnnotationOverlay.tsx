"use client";

import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getMarkerColor } from "@/lib/utils/markerColor";
import { AnnotationData, AssetAnnotation, AssetComment } from "@/types/file.types";
import { AnnotationTool } from "./AnnotationToolbar";

const DRAG_THRESHOLD = 0.01; // fraction of width/height — below this, a drag is treated as a click

interface Point {
  x: number;
  y: number;
}

interface AnnotationOverlayProps {
  annotations: AssetAnnotation[];
  comments: AssetComment[]; // pre-filtered to ones with a marker (positionX/positionY set)
  activeTool: AnnotationTool;
  color: string;
  highlightedCommentId: string | null;
  onCreateShape: (data: AnnotationData) => void;
  /** x/y are normalized PERCENTAGES (0–100), matching AssetComment.positionX/positionY — see its doc comment in file.types.ts. */
  onCreateCommentMarker: (x: number, y: number) => void;
  onSelectComment: (commentId: string) => void;
  /** Present only when the "delete" tool is active — clicking an existing shape removes it. */
  onDeleteAnnotation?: (annotationId: string) => void;
  className?: string;
}

/**
 * SVG + HTML overlay for drawing and displaying review annotations,
 * sized to exactly match its parent media container (video/image box
 * or one PDF page canvas — that container MUST be `position: relative`
 * and this overlay's `absolute inset-0` then pins markers to it, not
 * to the page/viewport, so they stay correctly placed through resize,
 * fullscreen, and the review panel opening/closing).
 *
 * Pointer-events are deliberately split: the root layer is
 * `pointer-events-none` whenever the active tool is "select" (normal
 * browsing) so clicks fall through to the video/image underneath
 * (play/pause, native interactions) instead of being swallowed by
 * this always-on-top layer — existing markers opt back in with their
 * own `pointer-events-auto` so they stay clickable in every mode.
 * Only while an actual draw/comment tool is selected does the root
 * layer capture pointer events, matching "clicking the video must NOT
 * accidentally play/pause the video" while in marker mode, and the
 * inverse in select mode.
 */
export function AnnotationOverlay({
  annotations,
  comments,
  activeTool,
  color,
  highlightedCommentId,
  onCreateShape,
  onCreateCommentMarker,
  onSelectComment,
  onDeleteAnnotation,
  className,
}: AnnotationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [draftEnd, setDraftEnd] = useState<Point | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const isDrawing = useRef(false);

  const isDrawTool = activeTool !== "select";
  const isShapeTool = activeTool === "circle" || activeTool === "rectangle" || activeTool === "arrow";

  // Internal drag/shape math stays in 0–1 fractions (matches AnnotationData's existing convention); only
  // the comment-marker callback converts to 0–100 percentages at the boundary, per AssetComment's contract.
  function pointFromEvent(e: ReactPointerEvent<HTMLDivElement>): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDrawTool || textDraft) return;
    const point = pointFromEvent(e);

    if (activeTool === "comment") {
      onCreateCommentMarker(point.x * 100, point.y * 100);
      return;
    }
    if (activeTool === "text") {
      setTextDraft({ x: point.x, y: point.y, value: "" });
      return;
    }
    if (isShapeTool) {
      isDrawing.current = true;
      setDraftStart(point);
      setDraftEnd(point);
    } else if (activeTool === "freehand") {
      isDrawing.current = true;
      setFreehandPoints([point]);
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDrawing.current) return;
    const point = pointFromEvent(e);
    if (isShapeTool) setDraftEnd(point);
    else if (activeTool === "freehand") setFreehandPoints((prev) => [...prev, point]);
  }

  function handlePointerUp() {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (isShapeTool && draftStart && draftEnd) {
      const dx = Math.abs(draftEnd.x - draftStart.x);
      const dy = Math.abs(draftEnd.y - draftStart.y);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        if (activeTool === "circle") {
          const cx = (draftStart.x + draftEnd.x) / 2;
          const cy = (draftStart.y + draftEnd.y) / 2;
          onCreateShape({ kind: "circle", cx, cy, rx: dx / 2, ry: dy / 2 });
        } else if (activeTool === "rectangle") {
          onCreateShape({
            kind: "rectangle",
            x: Math.min(draftStart.x, draftEnd.x),
            y: Math.min(draftStart.y, draftEnd.y),
            width: dx,
            height: dy,
          });
        } else if (activeTool === "arrow") {
          onCreateShape({ kind: "arrow", x1: draftStart.x, y1: draftStart.y, x2: draftEnd.x, y2: draftEnd.y });
        }
      }
    } else if (activeTool === "freehand" && freehandPoints.length > 1) {
      onCreateShape({ kind: "freehand", points: freehandPoints });
    }

    setDraftStart(null);
    setDraftEnd(null);
    setFreehandPoints([]);
  }

  function submitTextDraft() {
    if (textDraft && textDraft.value.trim()) {
      onCreateShape({ kind: "text", x: textDraft.x, y: textDraft.y, text: textDraft.value.trim() });
    }
    setTextDraft(null);
  }

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 select-none", isDrawTool ? "pointer-events-auto cursor-crosshair" : "pointer-events-none", className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {activeTool === "comment" && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-soft-lg">
          <MousePointerClick className="mr-1.5 inline h-3.5 w-3.5" />
          Click to add feedback
        </div>
      )}

      {activeTool === "delete" && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-soft-lg">
          Click a shape to delete it
        </div>
      )}

      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none">
        <defs>
          <marker id="annotation-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
          </marker>
        </defs>

        {annotations
          .filter((a) => a.type !== "text")
          .map((a) => (
            <AnnotationShape
              key={a.id}
              annotation={a}
              isDeletable={activeTool === "delete"}
              onDelete={() => onDeleteAnnotation?.(a.id)}
            />
          ))}

        {isShapeTool && draftStart && draftEnd && (
          <AnnotationShape
            annotation={{
              id: "draft",
              color,
              data:
                activeTool === "circle"
                  ? { kind: "circle", cx: (draftStart.x + draftEnd.x) / 2, cy: (draftStart.y + draftEnd.y) / 2, rx: Math.abs(draftEnd.x - draftStart.x) / 2, ry: Math.abs(draftEnd.y - draftStart.y) / 2 }
                  : activeTool === "rectangle"
                    ? { kind: "rectangle", x: Math.min(draftStart.x, draftEnd.x), y: Math.min(draftStart.y, draftEnd.y), width: Math.abs(draftEnd.x - draftStart.x), height: Math.abs(draftEnd.y - draftStart.y) }
                    : { kind: "arrow", x1: draftStart.x, y1: draftStart.y, x2: draftEnd.x, y2: draftEnd.y },
            } as AssetAnnotation}
            isDraft
          />
        )}

        {activeTool === "freehand" && freehandPoints.length > 1 && (
          <AnnotationShape annotation={{ id: "draft", color, data: { kind: "freehand", points: freehandPoints } } as AssetAnnotation} isDraft />
        )}
      </svg>

      {annotations
        .filter((a) => a.type === "text")
        .map((a) => {
          const data = a.data as Extract<AnnotationData, { kind: "text" }>;
          const deletable = activeTool === "delete";
          return (
            <div
              key={a.id}
              onPointerDown={(e) => deletable && e.stopPropagation()}
              onClick={(e) => {
                if (!deletable) return;
                e.stopPropagation();
                onDeleteAnnotation?.(a.id);
              }}
              className={cn(
                "absolute -translate-y-1/2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white shadow",
                deletable ? "pointer-events-auto cursor-pointer ring-2 ring-error hover:bg-error/70" : "pointer-events-none"
              )}
              style={{ left: `${data.x * 100}%`, top: `${data.y * 100}%` }}
            >
              {data.text}
            </div>
          );
        })}

      {textDraft && (
        <input
          autoFocus
          value={textDraft.value}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitTextDraft();
            if (e.key === "Escape") setTextDraft(null);
          }}
          onBlur={submitTextDraft}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Type a note..."
          className="pointer-events-auto absolute -translate-y-1/2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white outline-none ring-1 ring-primary placeholder:text-white/50"
          style={{ left: `${textDraft.x * 100}%`, top: `${textDraft.y * 100}%` }}
        />
      )}

      {comments.map((c) => {
        const isHighlighted = highlightedCommentId === c.id;
        const color = getMarkerColor(c.markerNumber);
        return (
          <button
            key={c.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelectComment(c.id);
            }}
            className={cn(
              "pointer-events-auto absolute flex h-7 w-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-soft-lg transition-transform hover:scale-110",
              isHighlighted && "scale-125 ring-4 ring-white/50"
            )}
            style={{ left: `${c.positionX ?? 0}%`, top: `${c.positionY ?? 0}%`, backgroundColor: color }}
            title={c.body}
          >
            {c.markerNumber ?? "•"}
            {c.isResolved && (
              <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-success">
                <Check className="h-2 w-2 text-white" />
              </span>
            )}
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent" style={{ borderTopColor: color }} />
          </button>
        );
      })}
    </div>
  );
}

function AnnotationShape({
  annotation,
  isDraft,
  isDeletable,
  onDelete,
}: {
  annotation: AssetAnnotation;
  isDraft?: boolean;
  isDeletable?: boolean;
  onDelete?: () => void;
}) {
  const { data, color } = annotation;
  const strokeProps = {
    stroke: isDeletable ? "#ef4444" : color || "#f59e0b",
    strokeWidth: isDeletable ? 3 : 2,
    vectorEffect: "non-scaling-stroke" as const,
    fill: "none",
    opacity: isDraft ? 0.7 : 1,
    style: isDeletable ? ({ pointerEvents: "all", cursor: "pointer" } as const) : undefined,
    onPointerDown: isDeletable ? (e: ReactPointerEvent) => e.stopPropagation() : undefined,
    onClick: isDeletable
      ? (e: ReactMouseEvent) => {
          e.stopPropagation();
          onDelete?.();
        }
      : undefined,
  };

  switch (data.kind) {
    case "circle":
      return <ellipse cx={data.cx} cy={data.cy} rx={data.rx} ry={data.ry} {...strokeProps} />;
    case "rectangle":
      return <rect x={data.x} y={data.y} width={data.width} height={data.height} {...strokeProps} />;
    case "arrow":
      return <line x1={data.x1} y1={data.y1} x2={data.x2} y2={data.y2} {...strokeProps} stroke={strokeProps.stroke} markerEnd="url(#annotation-arrowhead)" />;
    case "freehand":
      return <polyline points={data.points.map((p) => `${p.x},${p.y}`).join(" ")} {...strokeProps} strokeLinejoin="round" strokeLinecap="round" />;
    default:
      return null;
  }
}
