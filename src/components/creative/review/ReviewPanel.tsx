"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, ListPlus, MessageSquare, Play, Reply, Search, Trash2, X, XCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { AssetStatusBadge } from "@/components/creative/AssetStatusBadge";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useToast } from "@/hooks/useToast";
import { formatDate, timeAgo } from "@/lib/utils/date";
import { formatBytes, formatDuration } from "@/lib/utils/fileFormat";
import { getMarkerColor } from "@/lib/utils/markerColor";
import { AssetComment, ProjectFile } from "@/types/file.types";
import { Review } from "@/types/review.types";

export interface PendingMarker {
  timestampSeconds: number | null;
  positionX: number | null;
  positionY: number | null;
  pageNumber: number | null;
}

export type ReviewPanelTab = "comments" | "activity" | "details";

interface ReviewPanelProps {
  asset: ProjectFile;
  stageName: string | null;
  comments: AssetComment[];
  /** Current video/audio playhead, in seconds — powers the composer's "include current timestamp" checkbox. Ignored for images/PDFs. */
  currentTime: number;
  pendingReview: Review | null;
  onApprove: () => void;
  onRequestChanges: () => void;
  isReviewSubmitting: boolean;
  canApproveReviews: boolean;
  currentUid: string;
  highlightedCommentId: string | null;
  onSelectComment: (comment: AssetComment) => void;
  pendingMarker: PendingMarker | null;
  onClearPendingMarker: () => void;
  onAddComment: (body: string, parentCommentId: string | null, marker: PendingMarker | null) => Promise<boolean>;
  onResolveComment: (commentId: string, isResolved: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onCreateTaskFromComment: (comment: AssetComment) => void;
  tab: ReviewPanelTab;
  onTabChange: (tab: ReviewPanelTab) => void;
}

function markerLabel(comment: AssetComment): string | null {
  if (comment.timestampSeconds !== null) return formatDuration(comment.timestampSeconds);
  if (comment.pageNumber !== null) return `Page ${comment.pageNumber}`;
  return null;
}

export function ReviewPanel({
  asset,
  stageName,
  comments,
  currentTime,
  pendingReview,
  onApprove,
  onRequestChanges,
  isReviewSubmitting,
  canApproveReviews,
  currentUid,
  highlightedCommentId,
  onSelectComment,
  pendingMarker,
  onClearPendingMarker,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  onCreateTaskFromComment,
  tab,
  onTabChange,
}: ReviewPanelProps) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [includeTimestamp, setIncludeTimestamp] = useState(false);

  const canAttachTimestamp = asset.assetType === "video" || asset.assetType === "audio";

  const filteredComments = useMemo(() => {
    let result = comments;
    if (statusFilter !== "all") result = result.filter((c) => (statusFilter === "resolved" ? c.isResolved : !c.isResolved));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => c.body.toLowerCase().includes(q) || c.author.displayName.toLowerCase().includes(q));
    }
    return result;
  }, [comments, statusFilter, searchQuery]);

  const topLevel = filteredComments.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => filteredComments.filter((c) => c.parentCommentId === id);

  async function handleSubmit() {
    if (!draft.trim()) return;
    setIsSubmitting(true);
    try {
      const marker = pendingMarker ?? (includeTimestamp && canAttachTimestamp ? { timestampSeconds: currentTime, positionX: null, positionY: null, pageNumber: null } : null);
      const ok = await onAddComment(draft.trim(), null, marker);
      if (!ok) {
        toast.error("Couldn't post your comment. Please try again.");
        return;
      }
      setDraft("");
      setIncludeTimestamp(false);
      onClearPendingMarker();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReplySubmit(parentId: string) {
    if (!replyDraft.trim()) return;
    setIsSubmitting(true);
    try {
      const ok = await onAddComment(replyDraft.trim(), parentId, null);
      if (!ok) {
        toast.error("Couldn't post your reply. Please try again.");
        return;
      }
      setReplyDraft("");
      setReplyingTo(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {pendingReview && (
        <div className="flex flex-col gap-2 border-b border-border bg-surface-muted/50 p-3">
          <p className="text-xs font-medium text-foreground-muted">Pending review: &ldquo;{pendingReview.title}&rdquo;</p>
          {canApproveReviews ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onApprove} isLoading={isReviewSubmitting} className="flex-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={onRequestChanges} isLoading={isReviewSubmitting} className="flex-1">
                <XCircle className="h-3.5 w-3.5" /> Request changes
              </Button>
            </div>
          ) : (
            <p className="text-xs text-foreground-muted">Only workspace owners and admins can approve or request changes.</p>
          )}
        </div>
      )}

      <div className="flex shrink-0 border-b border-border">
        {(["comments", "activity", "details"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`flex-1 border-b-2 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "activity" ? (
        <div className="flex-1 overflow-y-auto p-3">
          <ActivityFeed take={50} filterTargetId={asset.id} />
        </div>
      ) : tab === "details" ? (
        <div className="flex-1 overflow-y-auto p-3">
          <dl className="flex flex-col gap-3 text-sm">
            <DetailRow label="File name" value={asset.fileName} />
            <DetailRow label="Type" value={asset.assetType} />
            <DetailRow label="Size" value={formatBytes(asset.sizeBytes)} />
            <DetailRow label="Uploaded by" value={asset.uploadedBy.displayName} />
            <DetailRow label="Uploaded" value={formatDate(asset.createdAt)} />
            <DetailRow label="Version" value={`v${asset.versionNumber}${asset.isLatestVersion ? " (latest)" : ""}`} />
            <DetailRow label="Stage" value={stageName ?? "Unassigned"} />
            <div className="flex items-center justify-between gap-2">
              <dt className="text-foreground-muted">Status</dt>
              <dd><AssetStatusBadge status={asset.reviewStatus} /></dd>
            </div>
          </dl>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-border p-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-muted" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search comments..."
                className="h-8 w-full rounded-theme border border-border bg-surface pl-7 pr-2 text-xs text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {topLevel.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-7 w-7" />}
                title={comments.length === 0 ? "No comments yet" : "No matching comments"}
                description={comments.length === 0 ? "Leave feedback, mark up a frame, or drop a timestamp." : "Try a different search or filter."}
                className="py-8"
              />
            ) : (
              <div className="flex flex-col gap-3">
                {topLevel.map((comment) => (
                  <div key={comment.id} className="flex flex-col gap-2">
                    <CommentRow
                      comment={comment}
                      isHighlighted={highlightedCommentId === comment.id}
                      currentUid={currentUid}
                      onSelect={() => onSelectComment(comment)}
                      onReply={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                      onResolve={() => onResolveComment(comment.id, !comment.isResolved)}
                      onDelete={() => setDeleteTargetId(comment.id)}
                      onCreateTask={() => onCreateTaskFromComment(comment)}
                    />

                    {repliesOf(comment.id).map((reply) => (
                      <div key={reply.id} className="ml-7 border-l border-border pl-3">
                        <CommentRow
                          comment={reply}
                          isHighlighted={highlightedCommentId === reply.id}
                          currentUid={currentUid}
                          onSelect={() => onSelectComment(reply)}
                          onDelete={() => setDeleteTargetId(reply.id)}
                          isReply
                        />
                      </div>
                    ))}

                    {replyingTo === comment.id && (
                      <div className="ml-7 flex gap-2 pl-3">
                        <Textarea
                          rows={1}
                          autoFocus
                          placeholder="Reply..."
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => handleReplySubmit(comment.id)} isLoading={isSubmitting} disabled={!replyDraft.trim()}>
                          Reply
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border p-3">
            {pendingMarker && (
              <div className="flex items-center justify-between rounded-theme bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                <span>
                  Commenting {pendingMarker.timestampSeconds !== null && `at ${formatDuration(pendingMarker.timestampSeconds)}`}
                  {pendingMarker.pageNumber !== null && `on page ${pendingMarker.pageNumber}`}
                  {pendingMarker.positionX !== null && " with a marker"}
                </span>
                <button onClick={onClearPendingMarker} aria-label="Cancel marker">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <Textarea rows={2} placeholder="Add a comment..." value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              {canAttachTimestamp && !pendingMarker ? (
                <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <input
                    type="checkbox"
                    checked={includeTimestamp}
                    onChange={(e) => setIncludeTimestamp(e.target.checked)}
                    className="accent-primary"
                  />
                  Include current timestamp ({formatDuration(currentTime)})
                </label>
              ) : (
                <span />
              )}
              <Button size="sm" onClick={handleSubmit} isLoading={isSubmitting} disabled={!draft.trim()}>
                Comment
              </Button>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) onDeleteComment(deleteTargetId);
          setDeleteTargetId(null);
        }}
        title="Delete comment?"
        description="This can't be undone."
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground capitalize">{value}</dd>
    </div>
  );
}

function CommentRow({
  comment,
  isHighlighted,
  currentUid,
  onSelect,
  onReply,
  onResolve,
  onDelete,
  onCreateTask,
  isReply,
}: {
  comment: AssetComment;
  isHighlighted: boolean;
  currentUid: string;
  onSelect: () => void;
  onReply?: () => void;
  onResolve?: () => void;
  onDelete: () => void;
  onCreateTask?: () => void;
  isReply?: boolean;
}) {
  const label = markerLabel(comment);
  const isOwn = comment.authorId === currentUid;
  const color = getMarkerColor(comment.markerNumber);

  return (
    <div
      className={`flex gap-2.5 rounded-theme border p-2.5 transition-colors ${isHighlighted ? "border-primary bg-primary/5" : "border-border bg-surface"}`}
      style={{ borderLeftColor: color, borderLeftWidth: comment.markerNumber !== null ? 3 : undefined }}
    >
      {comment.markerNumber !== null ? (
        <button
          onClick={onSelect}
          className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: color }}
          aria-label={`Jump to marker ${comment.markerNumber}`}
        >
          {comment.markerNumber}
          {comment.isResolved && (
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-surface bg-success">
              <Check className="h-2 w-2 text-white" />
            </span>
          )}
        </button>
      ) : (
        <Avatar name={comment.author.displayName} src={comment.author.photoURL} size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar name={comment.author.displayName} src={comment.author.photoURL} size="sm" className="h-4.5 w-4.5 text-[9px]" />
            <p className="truncate text-sm font-medium text-foreground">{comment.author.displayName}</p>
          </div>
          <span className="shrink-0 text-xs text-foreground-muted" title={formatDate(comment.createdAt)}>{timeAgo(comment.createdAt)}</span>
        </div>

        {label && (
          <button
            onClick={onSelect}
            className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: `${color}26`, color }}
          >
            <Play className="h-2.5 w-2.5" fill="currentColor" /> {label}
          </button>
        )}
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground-muted">{comment.body}</p>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {!isReply && onReply && (
              <button onClick={onReply} className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
                <Reply className="h-3 w-3" /> Reply
              </button>
            )}
            {onCreateTask && (
              <button onClick={onCreateTask} className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
                <ListPlus className="h-3 w-3" /> Create task
              </button>
            )}
            {isOwn && (
              <button onClick={onDelete} className="flex items-center gap-1 text-xs text-foreground-muted hover:text-error">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
          </div>
          {onResolve && (
            <button
              onClick={onResolve}
              className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                comment.isResolved ? "bg-success/15 text-success" : "bg-surface-muted text-foreground-muted"
              }`}
            >
              {comment.isResolved ? <Check className="h-3 w-3" /> : null}
              {comment.isResolved ? "Resolved" : "Open"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
