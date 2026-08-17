"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { AnnotationTool } from "./AnnotationToolbar";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import { AnnotationData, AssetAnnotation, AssetComment, ProjectFile } from "@/types/file.types";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

interface PdfReviewCanvasProps {
  asset: ProjectFile;
  comments: AssetComment[];
  annotations: AssetAnnotation[];
  activeTool: AnnotationTool;
  annotationColor: string;
  highlightedCommentId: string | null;
  /** Set (from a comment click in the review panel) to jump to that page — mirrors VideoReviewCanvas's seekTo prop. */
  seekToPage: number | null;
  onSeekPageHandled: () => void;
  onCreateCommentMarker: (x: number, y: number, pageNumber: number) => void;
  onCreateShape: (data: AnnotationData, pageNumber: number) => void;
  onSelectComment: (commentId: string) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
}

/**
 * Real per-page PDF rendering via pdfjs-dist — the app's existing PDF
 * "preview" elsewhere is a plain `<iframe>`, which can't expose page
 * numbers or take click coordinates (the native browser PDF viewer
 * inside it isn't scriptable), so page-scoped comments/annotations
 * genuinely need this. Loaded dynamically (not at module scope) since
 * pdfjs-dist touches browser-only APIs that don't exist during SSR.
 */
export function PdfReviewCanvas({
  asset,
  comments,
  annotations,
  activeTool,
  annotationColor,
  highlightedCommentId,
  seekToPage,
  onSeekPageHandled,
  onCreateCommentMarker,
  onCreateShape,
  onSelectComment,
  onDeleteAnnotation,
}: PdfReviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loadingTask = pdfjsLib.getDocument({ url: asset.url });
        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1);
      } catch (err) {
        console.error("[PdfReviewCanvas] failed to load PDF:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load this PDF.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      loadingTaskRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.url]);

  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || !canvasRef.current) return;

    let cancelled = false;

    async function renderPage() {
      try {
        const pdfPage = await doc!.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasSize({ width: viewport.width, height: viewport.height });

        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvasContext: ctx, viewport, canvas });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        // A cancelled render throws a benign "RenderingCancelledException" — ignore it.
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
          console.error("[PdfReviewCanvas] failed to render page:", err);
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [page, scale, numPages]);

  useEffect(() => {
    if (seekToPage === null) return;
    setPage(Math.min(Math.max(1, seekToPage), numPages || seekToPage));
    onSeekPageHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekToPage]);

  if (isLoading) return <Loader fullScreen label="Loading PDF..." />;
  if (error) return <ErrorState title="Couldn't load PDF" message={error} />;

  const pageComments = comments.filter((c) => c.pageNumber === page);
  const pageAnnotations = annotations.filter((a) => a.pageNumber === page);

  return (
    <div className="flex h-full flex-col bg-[#2a2a2e]">
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div className="relative shadow-soft-lg" style={{ width: canvasSize.width, height: canvasSize.height }}>
          <canvas ref={canvasRef} className="block bg-white" />
          {canvasSize.width > 0 && (
            <AnnotationOverlay
              annotations={pageAnnotations}
              comments={pageComments}
              activeTool={activeTool}
              color={annotationColor}
              highlightedCommentId={highlightedCommentId}
              onCreateCommentMarker={(x, y) => onCreateCommentMarker(x, y, page)}
              onCreateShape={(data) => onCreateShape(data, page)}
              onSelectComment={onSelectComment}
              onDeleteAnnotation={onDeleteAnnotation}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/90 px-4 py-2 text-white">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-theme p-1.5 hover:bg-white/10 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[80px] text-center font-mono text-xs text-white/80">
          Page {page} / {numPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          disabled={page >= numPages}
          className="rounded-theme p-1.5 hover:bg-white/10 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="mx-2 h-4 w-px bg-white/20" />

        <button onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - 0.2).toFixed(2)))} className="rounded-theme p-1.5 hover:bg-white/10" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[48px] text-center font-mono text-xs text-white/80">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + 0.2).toFixed(2)))} className="rounded-theme p-1.5 hover:bg-white/10" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
