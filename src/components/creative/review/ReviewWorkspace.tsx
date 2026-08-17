"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ReviewToolbar } from "./ReviewToolbar";
import { FileInfoBar } from "./FileInfoBar";
import { AnnotationToolbar, type AnnotationTool } from "./AnnotationToolbar";
import { VideoReviewCanvas } from "./VideoReviewCanvas";
import { ImageReviewCanvas } from "./ImageReviewCanvas";
import { PdfReviewCanvas } from "./PdfReviewCanvas";
import { ReviewPanel, type PendingMarker, type ReviewPanelTab } from "./ReviewPanel";
import { EditStatusesModal } from "./EditStatusesModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { SendForReviewModal } from "@/components/creative/SendForReviewModal";
import { CreateTaskFromAssetModal } from "@/components/creative/CreateTaskFromAssetModal";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { Button } from "@/components/ui/Button";
import { useFileComments } from "@/hooks/useFileComments";
import { useFileAnnotations } from "@/hooks/useFileAnnotations";
import { useFileActions } from "@/hooks/useFileActions";
import { useAssetOptions } from "@/hooks/useAssetOptions";
import { useReviews } from "@/hooks/useReviews";
import { useReviewActions } from "@/hooks/useReviewActions";
import { useStages } from "@/hooks/useStages";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useAuthContext } from "@/contexts/AuthContext";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { useToast } from "@/hooks/useToast";
import { getUploadValidationError } from "@/lib/constants/creativeFiles";
import { fileReviewRoute, projectRoute } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";
import { AnnotationData, AssetComment, ProjectFile } from "@/types/file.types";
import { AssetStatusOption } from "@/types/settings.types";
import { AssetGroup } from "@/lib/utils/assetVersions";

const DEFAULT_ANNOTATION_COLOR = "#f59e0b";

interface ReviewWorkspaceProps {
  projectId: string;
  stageId: string;
  group: AssetGroup;
  activeFileId: string;
}

/**
 * The full-screen Krock-style Creative Review Workspace shell — top
 * toolbar, main canvas (video/image/pdf/other), annotation toolbar,
 * and the right review panel. Every mutation here goes through the
 * SAME services the rest of the app uses (fileService, reviewService,
 * taskService, activityService via useFileActions/useReviewActions/
 * useTaskActions) — no parallel data path.
 */
export function ReviewWorkspace({ projectId, stageId, group, activeFileId }: ReviewWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser } = useAuthContext();
  const { project } = useProjectDetailsContext();

  const asset: ProjectFile = group.versions.find((v) => v.id === activeFileId) ?? group.latest;

  const { comments } = useFileComments(asset.id);
  const { annotations } = useFileAnnotations(asset.id);
  const { reviews } = useReviews(projectId);
  const { stages } = useStages(projectId);
  const { canApproveReviews } = useCurrentMemberRole();
  const fileActions = useFileActions();
  const reviewActions = useReviewActions();
  const { options: assetOptions, getStatus, saveStatuses } = useAssetOptions();

  const pendingReview = reviews.find((r) => r.status === "pending" && r.fileIds.includes(asset.id)) ?? null;
  const currentStage = stages.find((s) => s.id === asset.stageId) ?? null;

  const [activeTool, setActiveTool] = useState<AnnotationTool>("select");
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [seekToPage, setSeekToPage] = useState<number | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [pendingMarker, setPendingMarker] = useState<PendingMarker | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<ReviewPanelTab>("comments");
  const [isSendReviewOpen, setIsSendReviewOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [taskSourceComment, setTaskSourceComment] = useState<AssetComment | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isEditStatusesOpen, setIsEditStatusesOpen] = useState(false);
  const [isSavingStatuses, setIsSavingStatuses] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const versionInputRef = useRef<HTMLInputElement>(null);

  function goToVersion(v: ProjectFile) {
    router.replace(fileReviewRoute(projectId, stageId, v.id));
  }

  function handleBack() {
    router.push(`${projectRoute(projectId, "workspace")}?stage=${stageId}`);
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  async function handleUploadVersion(file: File | null) {
    if (!file) return;
    const validationError = getUploadValidationError(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setIsUploadingVersion(true);
    setUploadProgress(0);
    try {
      const newFileId = await fileActions.uploadNewVersion(projectId, group.latest, file, setUploadProgress);
      if (newFileId) {
        toast.success(`Uploaded v${group.latest.versionNumber + 1}`);
        router.replace(fileReviewRoute(projectId, stageId, newFileId));
      } else {
        toast.error("Upload failed. Please try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setIsUploadingVersion(false);
    }
  }

  async function handleArchive() {
    const result = await fileActions.archive(asset.id);
    setIsArchiveConfirmOpen(false);
    if (result === null) {
      toast.error(fileActions.error ?? "Couldn't archive this file. Please try again.");
      return;
    }
    toast.success("Archived");
    handleBack();
  }

  function handleSelectComment(comment: AssetComment) {
    setHighlightedCommentId(comment.id);
    if (comment.timestampSeconds !== null) setSeekTo(comment.timestampSeconds);
    if (comment.pageNumber !== null) setSeekToPage(comment.pageNumber);
    setIsPanelOpen(true);
    setPanelTab("comments");
  }

  function handleCreateCommentMarker(positionX: number, positionY: number, timestampSeconds: number | null = null, pageNumber: number | null = null) {
    setPendingMarker({ timestampSeconds, positionX, positionY, pageNumber });
    setActiveTool("select");
    setIsPanelOpen(true);
    setPanelTab("comments");
  }

  async function handleCreateShape(data: AnnotationData, timestampSeconds: number | null = null, pageNumber: number | null = null) {
    setActiveTool("select");
    await fileActions.addAnnotation(projectId, asset.id, asset.versionNumber, data.kind, data, DEFAULT_ANNOTATION_COLOR, {
      timestampSeconds,
      pageNumber,
    });
  }

  async function handleAddComment(body: string, parentCommentId: string | null, marker: PendingMarker | null): Promise<boolean> {
    const commentId = await fileActions.addComment(projectId, asset.id, asset.versionNumber, body, parentCommentId, marker ?? undefined);
    return commentId !== null;
  }

  function handleCreateTaskFromComment(comment: AssetComment) {
    setTaskSourceComment(comment);
    setIsCreateTaskOpen(true);
  }

  async function handleMoveToStage(newStageId: string | null) {
    await fileActions.assignToStage(asset.id, newStageId);
    toast.success(newStageId ? `Moved to "${stages.find((s) => s.id === newStageId)?.name}"` : "Removed from stage");
    router.replace(fileReviewRoute(projectId, newStageId ?? "none", asset.id));
  }

  async function handleStatusChange(option: AssetStatusOption) {
    if (option.id === asset.statusId) return;
    const previous = getStatus(asset.statusId);
    await fileActions.setStatus(asset.id, option.id, previous?.label ?? "No Status", option.label);
    toast.success(`Status changed to "${option.label}"`);
  }

  async function handleSaveStatuses(next: AssetStatusOption[]) {
    setIsSavingStatuses(true);
    try {
      await saveStatuses(next);
      toast.success("Statuses updated");
    } finally {
      setIsSavingStatuses(false);
    }
  }

  const currentUid = firebaseUser?.uid ?? "";

  return (
    <>
      <ReviewToolbar
        asset={asset}
        projectName={project?.name ?? ""}
        stageName={currentStage?.name ?? null}
        versions={group.versions}
        onSelectVersion={goToVersion}
        onBack={handleBack}
        onShare={handleShare}
        onUploadVersion={() => versionInputRef.current?.click()}
        isUploadingVersion={isUploadingVersion}
        uploadProgress={uploadProgress}
        onSendForReview={() => setIsSendReviewOpen(true)}
        onCreateTask={() => {
          setTaskSourceComment(null);
          setIsCreateTaskOpen(true);
        }}
        onDownload={() => fileActions.logDownload(asset.id, asset.fileName)}
        onArchive={() => setIsArchiveConfirmOpen(true)}
        isPanelOpen={isPanelOpen}
        onTogglePanel={() => setIsPanelOpen((v) => !v)}
        stages={stages}
        currentStageId={asset.stageId}
        onMoveToStage={handleMoveToStage}
        statuses={assetOptions.statuses}
        canEditStatuses={canApproveReviews}
        onSelectStatus={handleStatusChange}
        onOpenEditStatuses={() => setIsEditStatusesOpen(true)}
      />
      <input ref={versionInputRef} type="file" className="hidden" onChange={(e) => handleUploadVersion(e.target.files?.[0] ?? null)} />

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            {asset.assetType === "video" ? (
              <VideoReviewCanvas
                asset={asset}
                comments={comments}
                annotations={annotations}
                activeTool={activeTool}
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
                onDeleteAnnotation={(id) => fileActions.deleteAnnotation(asset.id, id)}
              />
            ) : asset.assetType === "image" ? (
              <ImageReviewCanvas
                asset={asset}
                comments={comments.filter((c) => c.positionX !== null)}
                annotations={annotations}
                activeTool={activeTool}
                annotationColor={DEFAULT_ANNOTATION_COLOR}
                highlightedCommentId={highlightedCommentId}
                onCreateCommentMarker={(x, y) => handleCreateCommentMarker(x, y, null, null)}
                onCreateShape={(data) => handleCreateShape(data, null, null)}
                onSelectComment={(id) => {
                  const c = comments.find((c) => c.id === id);
                  if (c) handleSelectComment(c);
                }}
                onDeleteAnnotation={(id) => fileActions.deleteAnnotation(asset.id, id)}
              />
            ) : asset.assetType === "pdf" ? (
              <PdfReviewCanvas
                asset={asset}
                comments={comments.filter((c) => c.pageNumber !== null)}
                annotations={annotations}
                activeTool={activeTool}
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
                onDeleteAnnotation={(id) => fileActions.deleteAnnotation(asset.id, id)}
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

          {(asset.assetType === "video" || asset.assetType === "image" || asset.assetType === "pdf") && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2">
              <AnnotationToolbar active={activeTool} onChange={setActiveTool} />
            </div>
          )}
        </div>

        {isPanelOpen && (
          <>
            <div className="fixed inset-0 z-10 bg-black/40 sm:bg-transparent lg:hidden" onClick={() => setIsPanelOpen(false)} />
            <div
              className={cn(
                "fixed inset-x-0 bottom-0 z-20 flex h-[70vh] flex-col rounded-t-theme border-t border-border bg-surface shadow-soft-lg",
                "sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:h-full sm:w-96 sm:rounded-none sm:border-l sm:border-t-0",
                "lg:static lg:z-auto lg:h-auto lg:w-96 lg:shadow-none"
              )}
            >
              <button
                onClick={() => setIsPanelOpen(false)}
                className="absolute right-2 top-2 rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted lg:hidden"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
              <ReviewPanel
                asset={asset}
                stageName={currentStage?.name ?? null}
                comments={comments}
                currentTime={currentTime}
                pendingReview={pendingReview}
                onApprove={async () => {
                  if (!pendingReview) return;
                  await reviewActions.approve(pendingReview.id);
                  toast.success("Approved");
                }}
                onRequestChanges={async () => {
                  if (!pendingReview) return;
                  await reviewActions.requestChanges(pendingReview.id, null);
                  toast.success("Changes requested");
                }}
                isReviewSubmitting={reviewActions.isSubmitting}
                canApproveReviews={canApproveReviews}
                currentUid={currentUid}
                highlightedCommentId={highlightedCommentId}
                onSelectComment={handleSelectComment}
                pendingMarker={pendingMarker}
                onClearPendingMarker={() => setPendingMarker(null)}
                onAddComment={handleAddComment}
                onResolveComment={(id, isResolved) => fileActions.resolveComment(asset.id, id, isResolved)}
                onDeleteComment={(id) => fileActions.deleteComment(asset.id, id)}
                onCreateTaskFromComment={handleCreateTaskFromComment}
                tab={panelTab}
                onTabChange={setPanelTab}
              />
            </div>
          </>
        )}
      </div>

      <FileInfoBar
        asset={asset}
        versionCount={group.versions.length}
        stageName={currentStage?.name ?? null}
        onUploadVersion={() => versionInputRef.current?.click()}
        onDownload={() => fileActions.logDownload(asset.id, asset.fileName)}
        onArchive={() => setIsArchiveConfirmOpen(true)}
      />

      <EditStatusesModal
        isOpen={isEditStatusesOpen}
        onClose={() => setIsEditStatusesOpen(false)}
        statuses={assetOptions.statuses}
        isSaving={isSavingStatuses}
        onSave={handleSaveStatuses}
      />

      <ConfirmModal
        isOpen={isArchiveConfirmOpen}
        onClose={() => setIsArchiveConfirmOpen(false)}
        onConfirm={handleArchive}
        title="Archive this file?"
        description={`"${asset.fileName}" will be hidden from the project. You can restore it later.`}
        confirmLabel="Archive"
        isSubmitting={fileActions.isSubmitting}
      />

      <SendForReviewModal asset={asset} isOpen={isSendReviewOpen} onClose={() => setIsSendReviewOpen(false)} />
      <CreateTaskFromAssetModal
        asset={asset}
        comment={taskSourceComment}
        isOpen={isCreateTaskOpen}
        onClose={() => {
          setIsCreateTaskOpen(false);
          setTaskSourceComment(null);
        }}
      />
    </>
  );
}
