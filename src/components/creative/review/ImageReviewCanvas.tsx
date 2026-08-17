"use client";

import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { AnnotationTool } from "./AnnotationToolbar";
import { AnnotationData, AssetAnnotation, AssetComment, ProjectFile } from "@/types/file.types";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

interface ImageReviewCanvasProps {
  asset: ProjectFile;
  comments: AssetComment[];
  annotations: AssetAnnotation[];
  activeTool: AnnotationTool;
  annotationColor: string;
  highlightedCommentId: string | null;
  onCreateCommentMarker: (x: number, y: number) => void;
  onCreateShape: (data: AnnotationData) => void;
  onSelectComment: (commentId: string) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
}

export function ImageReviewCanvas({
  asset,
  comments,
  annotations,
  activeTool,
  annotationColor,
  highlightedCommentId,
  onCreateCommentMarker,
  onCreateShape,
  onSelectComment,
  onDeleteAnnotation,
}: ImageReviewCanvasProps) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  function zoomBy(delta: number) {
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s + delta).toFixed(2))));
  }

  function resetView() {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  function handleMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (activeTool !== "select" || scale <= 1) return;
    isPanning.current = true;
    lastPoint.current = { x: e.clientX, y: e.clientY };
  }

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPoint.current.x;
    const dy = e.clientY - lastPoint.current.y;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function stopPanning() {
    isPanning.current = false;
  }

  return (
    <div className="relative flex h-full flex-col bg-[repeating-conic-gradient(#111_0%_25%,#000_0%_50%)] bg-[length:20px_20px]">
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPanning}
        onMouseLeave={stopPanning}
        style={{ cursor: scale > 1 && activeTool === "select" ? (isPanning.current ? "grabbing" : "grab") : "default" }}
      >
        <div
          className="relative max-h-full max-w-full"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transition: isPanning.current ? "none" : "transform 0.1s ease-out" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.url} alt={asset.fileName} className="block max-h-[80vh] max-w-[80vw] select-none object-contain" draggable={false} />
          <AnnotationOverlay
            annotations={annotations}
            comments={comments}
            activeTool={activeTool}
            color={annotationColor}
            highlightedCommentId={highlightedCommentId}
            onCreateCommentMarker={onCreateCommentMarker}
            onCreateShape={onCreateShape}
            onSelectComment={onSelectComment}
            onDeleteAnnotation={onDeleteAnnotation}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 border-t border-white/10 bg-black/95 px-4 py-2">
        <button onClick={() => zoomBy(-0.25)} className="rounded-theme p-1.5 text-white hover:bg-white/10" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[48px] text-center font-mono text-xs text-white/80">{Math.round(scale * 100)}%</span>
        <button onClick={() => zoomBy(0.25)} className="rounded-theme p-1.5 text-white hover:bg-white/10" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button onClick={resetView} className="ml-2 rounded-theme p-1.5 text-white hover:bg-white/10" aria-label="Fit to screen" title="Fit to screen">
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
