"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { ReviewToolbar } from "./ReviewToolbar";
import { FileInfoBar } from "./FileInfoBar";
import { AnnotationToolbar, type AnnotationTool } from "./AnnotationToolbar";
import { VideoReviewCanvas } from "./VideoReviewCanvas";
import { ImageReviewCanvas } from "./ImageReviewCanvas";
import { PdfReviewCanvas } from "./PdfReviewCanvas";
import { ReviewRoundPanel } from "./ReviewRoundPanel";
import { markRoundCommented } from "@/services/reviewRoundService";
import { isRoundOpen, normalizeRoundStatus, versionSwitchTarget } from "@/lib/reviewRounds";
import { ReviewPanel, type PendingMarker, type ReviewPanelTab } from "./ReviewPanel";
import { EditStatusesModal } from "./EditStatusesModal";
import { ReviewLinkModal } from "./ReviewLinkModal";
import { InternalCompare } from "./InternalCompare";
import { useSecurePreview } from "@/hooks/useSecurePreview";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import type { CompareMode } from "@/components/review/compare/CompareView";
import { defaultComparePair } from "@/lib/utils/compareSync";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { SendForReviewModal } from "@/components/creative/SendForReviewModal";
import { CreateTaskFromAssetModal } from "@/components/creative/CreateTaskFromAssetModal";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { useFileComments } from "@/hooks/useFileComments";
import { useFileAnnotations } from "@/hooks/useFileAnnotations";
import { useFileActions } from "@/hooks/useFileActions";
import { useAssetOptions } from "@/hooks/useAssetOptions";
import { useReviews } from "@/hooks/useReviews";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import type { Review } from "@/types/review.types";
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

/**
 * Where to anchor the comment-marker pin for a just-drawn shape —
 * AnnotationData's coordinates are 0–1 fractions (see
 * AnnotationOverlay.tsx), converted here to the 0–100 percentage
 * scale AssetComment.positionX/positionY already use.
 */
export function annotationAnchorPosition(data: AnnotationData): { x: number; y: number } {
  switch (data.kind) {
    case "rectangle":
      return { x: (data.x + data.width / 2) * 100, y: (data.y + data.height / 2) * 100 };
    case "circle":
      return { x: data.cx * 100, y: data.cy * 100 };
    case "arrow":
      return { x: ((data.x1 + data.x2) / 2) * 100, y: ((data.y1 + data.y2) / 2) * 100 };
    case "freehand": {
      const avgX = data.points.reduce((sum, p) => sum + p.x, 0) / data.points.length;
      const avgY = data.points.reduce((sum, p) => sum + p.y, 0) / data.points.length;
      return { x: avgX * 100, y: avgY * 100 };
    }
    case "text":
      return { x: data.x * 100, y: data.y * 100 };
  }
}

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
  const { workspaceId } = useWorkspaceContext();
  const { project } = useProjectDetailsContext();

  const asset: ProjectFile = group.versions.find((v) => v.id === activeFileId) ?? group.latest;

  // The player NEVER reads the permanent Firebase token URL (`asset.url`): media comes from a ticketed, access-rechecked
  // preview route. Until the ticket is issued the canvases are not rendered at all (no fallback to the permanent URL),
  // and the thumbnail/filmstrip URL — also a permanent token link — is withheld from the player.
  const preview = useSecurePreview(asset);
  const mediaAsset: ProjectFile | null = preview.url ? ({ ...asset, url: preview.url, thumbnailUrl: null } as ProjectFile) : null;
  const needsMedia = asset.assetType === "video" || asset.assetType === "image" || asset.assetType === "pdf";

  const { comments } = useFileComments(asset.id);
  const { annotations } = useFileAnnotations(asset.id);
  const { reviews } = useReviews(projectId);
  const { stages } = useStages(projectId);
  const { canApproveReviews } = useCurrentMemberRole();
  const fileActions = useFileActions();
  const reviewActions = useReviewActions();
  const { options: assetOptions, getStatus, saveStatuses } = useAssetOptions();

  // Legacy single-approver requests only; round reviews (schemaVersion 2) are decided through the round panel.
  const pendingReview = reviews.find((r) => r.schemaVersion !== 2 && r.status === "pending" && r.fileIds.includes(asset.id)) ?? null;
  const assetRounds = useMemo(
    () => reviews.filter((r) => r.schemaVersion === 2 && r.assetGroupId === group.latest.assetGroupId).sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0)),
    [reviews, group.latest.assetGroupId]
  );
  const [sendPrefill, setSendPrefill] = useState<Review | null>(null);
  // The round the user picked (history list or a ?round= notification link). The URL is NAVIGATION only: the round must be in the list
  // of rounds the rules already let this user read for THIS asset, otherwise it is ignored and the normal review page shows.
  const searchParams = useSearchParams();
  const roundParam = searchParams.get("round");
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(roundParam);
  useEffect(() => { if (roundParam) setSelectedRoundId(roundParam); }, [roundParam]);
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
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const versionInputRef = useRef<HTMLInputElement>(null);

  // Version comparison. URL state (?compare=2,3&mode=side) carries only version NUMBERS for deep links — it is never an
  // authorization source: /api/files/compare re-validates both versions server-side on every open.
  const [comparePair, setComparePair] = useState<[number, number] | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>("side");
  const versionNumbers = group.versions.map((v) => v.versionNumber ?? 1);
  const canCompare = group.versions.length > 1 && (asset.assetType === "video" || asset.assetType === "image");

  function syncCompareUrl(pair: [number, number] | null, mode: CompareMode) {
    const url = new URL(window.location.href);
    if (pair) {
      url.searchParams.set("compare", pair.join(","));
      url.searchParams.set("mode", mode);
    } else {
      url.searchParams.delete("compare");
      url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", url.toString());
  }

  useEffect(() => {
    if (!canCompare) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("compare")?.split(",").map(Number);
    if (raw && raw.length === 2 && raw.every((n) => Number.isInteger(n) && versionNumbers.includes(n)) && raw[0] !== raw[1]) {
      setComparePair([raw[0]!, raw[1]!]);
      if (params.get("mode") === "overlay") setCompareMode("overlay");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCompare]);

  function openCompare() {
    const pair = defaultComparePair(versionNumbers, asset.versionNumber ?? 1);
    if (!pair) return;
    setComparePair(pair);
    syncCompareUrl(pair, compareMode);
  }

  function exitCompare() {
    setComparePair(null);
    syncCompareUrl(null, compareMode);
  }

  function goToVersion(v: ProjectFile) {
    setSelectedRoundId(null);
    router.replace(fileReviewRoute(projectId, stageId, v.id));
  }

  /** Picking a round of another version also switches the viewed version, so a round's decisions are never shown beside a different version. */
  function selectRound(r: Review) {
    setSelectedRoundId(r.id);
    const target = versionSwitchTarget(r, asset.id, group.versions.map((v) => v.id));
    if (target) router.replace(`${fileReviewRoute(projectId, stageId, target)}?round=${r.id}`);
  }

  function handleBack() {
    router.push(`${projectRoute(projectId, "workspace")}?stage=${stageId}`);
  }

  function handleShare() {
    setIsShareModalOpen(true);
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
    // A drawn shape/text mark has no comment/body field of its own
    // (see AssetAnnotation in file.types.ts — it's a separate
    // Firestore subcollection from AssetComment, purely visual) — so
    // immediately open the SAME comment composer the point-marker tool
    // uses, pre-positioned at the shape's own anchor point and moment,
    // letting the reviewer say something about what they just marked.
    // This reuses the existing pendingMarker/ReviewPanel flow exactly
    // as-is; the shape itself is already saved above regardless of
    // whether a comment is actually typed afterward.
    const anchor = annotationAnchorPosition(data);
    setPendingMarker({ timestampSeconds, positionX: anchor.x, positionY: anchor.y, pageNumber });
    setIsPanelOpen(true);
    setPanelTab("comments");
  }

  async function handleAddComment(body: string, parentCommentId: string | null, marker: PendingMarker | null): Promise<boolean> {
    const commentId = await fileActions.addComment(projectId, asset.id, asset.versionNumber, body, parentCommentId, marker ?? undefined);
    if (commentId !== null && workspaceId) {
      // A listed reviewer's comment on the round's own version earns them "Commented" (the server verifies the comment really exists).
      const mine = assetRounds.find((r) => r.fileId === asset.id && isRoundOpen({ status: normalizeRoundStatus(r.status), supersededByRoundId: r.supersededByRoundId }) && r.reviewers?.[`u_${currentUid}`] && !r.reviewers[`u_${currentUid}`]!.removedAt);
      if (mine) markRoundCommented(workspaceId, mine.id).catch(() => undefined);
    }
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
        onCompare={canCompare ? openCompare : undefined}
        onBack={handleBack}
        onShare={handleShare}
        onUploadVersion={() => versionInputRef.current?.click()}
        isUploadingVersion={isUploadingVersion}
        uploadProgress={uploadProgress}
        onSendForReview={() => { setSendPrefill(null); setIsSendReviewOpen(true); }}
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

      {comparePair ? (
        <InternalCompare
          versions={group.versions}
          pair={comparePair}
          onPairChange={(p) => {
            setComparePair(p);
            syncCompareUrl(p, compareMode);
          }}
          mode={compareMode}
          onModeChange={(m) => {
            setCompareMode(m);
            syncCompareUrl(comparePair, m);
          }}
          actor={fileActions.currentActor()}
          onExit={exitCompare}
        />
      ) : (
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            {needsMedia && !mediaAsset ? (
              preview.error ? (
                <div className="flex h-full items-center justify-center bg-black p-6"><ErrorState title="Couldn't load the preview" message={preview.error} /></div>
              ) : (
                <div className="flex h-full items-center justify-center bg-black"><Loader label="Loading preview..." /></div>
              )
            ) : asset.assetType === "video" && mediaAsset ? (
              <VideoReviewCanvas
                asset={mediaAsset}
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
                pendingMarker={pendingMarker}
                onSubmitPendingComment={async (body) => {
                  const ok = await handleAddComment(body, null, pendingMarker);
                  if (ok) setPendingMarker(null);
                  return ok;
                }}
                onCancelPendingComment={() => setPendingMarker(null)}
              />
            ) : asset.assetType === "image" && mediaAsset ? (
              <ImageReviewCanvas
                asset={mediaAsset}
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
            ) : asset.assetType === "pdf" && mediaAsset ? (
              <PdfReviewCanvas
                asset={mediaAsset}
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
                {/* No "Open" link: it pointed at the permanent file URL, i.e. a download that skipped the download permission. Use the toolbar's Download. */}
              </div>
            )}
          </div>

          {(asset.assetType === "video" || asset.assetType === "image" || asset.assetType === "pdf") && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2">
              <AnnotationToolbar active={activeTool} onChange={setActiveTool} />
            </div>
          )}
        </div>

        <AnimatePresence>
          {isPanelOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-10 bg-black/40 sm:bg-transparent lg:hidden"
                onClick={() => setIsPanelOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
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
                roundSlot={
                  workspaceId ? (
                    <ReviewRoundPanel
                      workspaceId={workspaceId}
                      asset={asset}
                      rounds={assetRounds}
                      currentUid={currentUid}
                      selectedRoundId={selectedRoundId}
                      onSelectRound={selectRound}
                      onStartRound={(prefill) => { setSendPrefill(prefill); setIsSendReviewOpen(true); }}
                    />
                  ) : null
                }
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
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      )}

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

      <ReviewLinkModal asset={asset} isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />
      <SendForReviewModal asset={asset} isOpen={isSendReviewOpen} onClose={() => setIsSendReviewOpen(false)} prefill={sendPrefill} />
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
