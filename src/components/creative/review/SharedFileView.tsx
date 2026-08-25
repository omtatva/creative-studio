"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Send, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { VideoReviewCanvas } from "./VideoReviewCanvas";
import { ImageReviewCanvas } from "./ImageReviewCanvas";
import { PdfReviewCanvas } from "./PdfReviewCanvas";
import { AnnotationToolbar, type AnnotationTool } from "./AnnotationToolbar";
import { annotationAnchorPosition } from "./ReviewWorkspace";
import type { PendingMarker } from "./ReviewPanel";
import { useFileComments } from "@/hooks/useFileComments";
import { useFileAnnotations } from "@/hooks/useFileAnnotations";
import { addAssetComment, deleteAssetComment } from "@/services/fileCommentService";
import { addAnnotation } from "@/services/fileAnnotationService";
import { formatDuration } from "@/lib/utils/fileFormat";
import { timeAgo } from "@/lib/utils/date";
import { getMarkerColor } from "@/lib/utils/markerColor";
import { cn } from "@/lib/utils/cn";
import { AnnotationData, AssetComment, FileSharePermission, ProjectFile } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

const DEFAULT_ANNOTATION_COLOR = "#f59e0b";

interface SharedFileViewProps {
  asset: ProjectFile;
  permission: FileSharePermission;
  /** null while the visitor has no usable identity yet (anonymous sign-in still pending, or unavailable) — commenting stays disabled until this resolves, even if `permission` allows it. */
  actor: TaskActor | null;
}

function markerLabel(comment: AssetComment): string | null {
  if (comment.timestampSeconds !== null) return formatDuration(comment.timestampSeconds);
  if (comment.pageNumber !== null) return `Page ${comment.pageNumber}`;
  return null;
}

/**
 * The public /share/[shareToken] page's actual content — a deliberately
 * SEPARATE, simpler sibling to ReviewWorkspace.tsx rather than that
 * component reused directly: ReviewWorkspace pulls in review-approval,
 * task-creation, version-upload, and archive/status editing, none of
 * which a link-sharing visitor should ever see (see FileShareSettings —
 * a shared link only ever grants viewing or commenting on this one
 * file). The canvases and comment/annotation data model underneath are
 * fully reused as-is; only the surrounding chrome is new.
 */
export function SharedFileView({ asset, permission, actor }: SharedFileViewProps) {
  const { comments } = useFileComments(asset.id);
  const { annotations } = useFileAnnotations(asset.id);
  const canWrite = permission === "comment" && actor !== null;

  const [activeTool, setActiveTool] = useState<AnnotationTool>("select");
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [seekToPage, setSeekToPage] = useState<number | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [pendingMarker, setPendingMarker] = useState<PendingMarker | null>(null);
  const [draft, setDraft] = useState("");
  const [includeTimestamp, setIncludeTimestamp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSelectComment(comment: AssetComment) {
    setHighlightedCommentId(comment.id);
    if (comment.timestampSeconds !== null) setSeekTo(comment.timestampSeconds);
    if (comment.pageNumber !== null) setSeekToPage(comment.pageNumber);
  }

  function handleCreateCommentMarker(x: number, y: number, timestampSeconds: number | null, pageNumber: number | null) {
    if (!canWrite) return;
    setActiveTool("select");
    setPendingMarker({ timestampSeconds, positionX: x, positionY: y, pageNumber });
  }

  async function handleCreateShape(data: AnnotationData, timestampSeconds: number | null, pageNumber: number | null) {
    if (!canWrite || !actor) return;
    setActiveTool("select");
    await addAnnotation({
      workspaceId: asset.workspaceId,
      projectId: asset.projectId,
      fileId: asset.id,
      version: asset.versionNumber,
      author: actor,
      type: data.kind,
      data,
      color: DEFAULT_ANNOTATION_COLOR,
      timestampSeconds,
      pageNumber,
    });
    const anchor = annotationAnchorPosition(data);
    setPendingMarker({ timestampSeconds, positionX: anchor.x, positionY: anchor.y, pageNumber });
  }

  async function submitPendingComment(body: string): Promise<boolean> {
    const ok = await submitComment(body, pendingMarker);
    if (ok) setPendingMarker(null);
    return ok;
  }

  async function submitComment(body: string, marker: PendingMarker | null): Promise<boolean> {
    if (!actor || !body.trim()) return false;
    setIsSubmitting(true);
    try {
      await addAssetComment({
        workspaceId: asset.workspaceId,
        projectId: asset.projectId,
        fileId: asset.id,
        version: asset.versionNumber,
        author: actor,
        body: body.trim(),
        parentCommentId: null,
        timestampSeconds: marker?.timestampSeconds ?? null,
        positionX: marker?.positionX ?? null,
        positionY: marker?.positionY ?? null,
        pageNumber: marker?.pageNumber ?? null,
      });
      return true;
    } catch {
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleComposerSubmit() {
    const marker = includeTimestamp ? { timestampSeconds: currentTime, positionX: null, positionY: null, pageNumber: null } : null;
    const ok = await submitComment(draft, marker);
    if (ok) {
      setDraft("");
      setIncludeTimestamp(false);
    }
  }

  async function handleDeleteOwnComment(commentId: string) {
    await deleteAssetComment(asset.id, commentId);
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-hidden">
          {asset.assetType === "video" ? (
            <VideoReviewCanvas
              asset={asset}
              comments={comments}
              annotations={annotations}
              activeTool={canWrite ? activeTool : "select"}
              annotationColor={DEFAULT_ANNOTATION_COLOR}
              seekTo={seekTo}
              onSeekHandled={() => setSeekTo(null)}
              onTimeChange={setCurrentTime}
              highlightedCommentId={highlightedCommentId}
              onCreateCommentMarker={(x, y, t) => handleCreateCommentMarker(x, y, t, null)}
              onCreateShape={(data, t) => handleCreateShape(data, t, null)}
              onSelectComment={(id) => {
                const c = comments.find((c) => c.id === id);
                if (c) handleSelectComment(c);
              }}
              pendingMarker={pendingMarker}
              onSubmitPendingComment={submitPendingComment}
              onCancelPendingComment={() => setPendingMarker(null)}
            />
          ) : asset.assetType === "image" ? (
            <ImageReviewCanvas
              asset={asset}
              comments={comments.filter((c) => c.positionX !== null)}
              annotations={annotations}
              activeTool={canWrite ? activeTool : "select"}
              annotationColor={DEFAULT_ANNOTATION_COLOR}
              highlightedCommentId={highlightedCommentId}
              onCreateCommentMarker={(x, y) => handleCreateCommentMarker(x, y, null, null)}
              onCreateShape={(data) => handleCreateShape(data, null, null)}
              onSelectComment={(id) => {
                const c = comments.find((c) => c.id === id);
                if (c) handleSelectComment(c);
              }}
            />
          ) : asset.assetType === "pdf" ? (
            <PdfReviewCanvas
              asset={asset}
              comments={comments.filter((c) => c.pageNumber !== null)}
              annotations={annotations}
              activeTool={canWrite ? activeTool : "select"}
              annotationColor={DEFAULT_ANNOTATION_COLOR}
              highlightedCommentId={highlightedCommentId}
              seekToPage={seekToPage}
              onSeekPageHandled={() => setSeekToPage(null)}
              onCreateCommentMarker={(x, y, page) => handleCreateCommentMarker(x, y, null, page)}
              onCreateShape={(data, page) => handleCreateShape(data, null, page)}
              onSelectComment={(id) => {
                const c = comments.find((c) => c.id === id);
                if (c) handleSelectComment(c);
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-muted text-center">
              <FileTypeIcon contentType={asset.contentType} className="h-12 w-12 text-foreground-muted" />
              <div>
                <p className="text-sm font-medium text-foreground">{asset.fileName}</p>
                <p className="text-xs text-foreground-muted">No preview available for this file type.</p>
              </div>
              <a href={asset.url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">Open</Button>
              </a>
            </div>
          )}
        </div>

        {canWrite && (asset.assetType === "video" || asset.assetType === "image" || asset.assetType === "pdf") && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <AnnotationToolbar active={activeTool} onChange={setActiveTool} />
          </div>
        )}
      </div>

      <div className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <p className="text-sm font-semibold text-foreground">Comments</p>
          <span className="text-xs text-foreground-muted">({comments.length})</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {comments.length === 0 ? (
            <EmptyState title="No comments yet" description={canWrite ? "Leave feedback or drop a timestamp." : "Nothing's been said about this yet."} className="py-8" />
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => {
                const label = markerLabel(comment);
                const isOwn = actor !== null && comment.authorId === actor.uid;
                return (
                  <button
                    key={comment.id}
                    onClick={() => handleSelectComment(comment)}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-theme border p-2.5 text-left transition-colors",
                      highlightedCommentId === comment.id ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={comment.author.displayName} src={comment.author.photoURL} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{comment.author.displayName}</p>
                        <p className="text-[10px] text-foreground-muted">{timeAgo(comment.createdAt)}</p>
                      </div>
                      {label && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: getMarkerColor(comment.markerNumber) }}
                        >
                          {label}
                        </span>
                      )}
                      {isOwn && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteOwnComment(comment.id);
                          }}
                          className="shrink-0 rounded-theme p-1 text-foreground-muted hover:bg-error/10 hover:text-error"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {canWrite ? (
          <div className="flex flex-col gap-2 border-t border-border p-3">
            <AnimatePresence>
              {pendingMarker && (
                <div className="flex items-center justify-between rounded-theme bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                  <span>
                    Commenting {pendingMarker.timestampSeconds !== null && `at ${formatDuration(pendingMarker.timestampSeconds)}`}
                    {pendingMarker.pageNumber !== null && `on page ${pendingMarker.pageNumber}`}
                  </span>
                  <button onClick={() => setPendingMarker(null)} aria-label="Cancel marker">×</button>
                </div>
              )}
            </AnimatePresence>
            <Textarea rows={2} placeholder="Add a comment..." value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              {asset.assetType === "video" && !pendingMarker ? (
                <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <input type="checkbox" checked={includeTimestamp} onChange={(e) => setIncludeTimestamp(e.target.checked)} className="accent-primary" />
                  Include current timestamp ({formatDuration(currentTime)})
                </label>
              ) : (
                <span />
              )}
              <Button size="sm" onClick={handleComposerSubmit} isLoading={isSubmitting} disabled={!draft.trim()}>
                <Send className="h-3.5 w-3.5" />
                Comment
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-border p-3 text-center text-xs text-foreground-muted">Viewing only — commenting is turned off for this link.</div>
        )}
      </div>
    </div>
  );
}
