"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, FileStack, LayoutGrid, LayoutList, LayoutTemplate, Plus, Search, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { AssetCard } from "./AssetCard";
import { AssetListRow } from "./AssetListRow";
import { StageCard } from "./StageCard";
import { StageFormModal } from "./StageFormModal";
import { CreativeUploadZone } from "./CreativeUploadZone";
import { UploadProgressList, type UploadQueueItem } from "./UploadProgressList";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useFiles } from "@/hooks/useFiles";
import { useStages } from "@/hooks/useStages";
import { useFileActions } from "@/hooks/useFileActions";
import { useStageActions } from "@/hooks/useStageActions";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { useToast } from "@/hooks/useToast";
import { groupAssetVersions, type AssetGroup } from "@/lib/utils/assetVersions";
import { getUploadValidationError, ACCEPTED_FILE_INPUT } from "@/lib/constants/creativeFiles";
import { fileReviewRoute } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";
import { AssetStatus } from "@/types/file.types";
import { Stage } from "@/types/stage.types";

type SortKey = "updated" | "name" | "size";
const STATUS_FILTERS: { key: AssetStatus | "all"; label: string }[] = [
  { key: "all", label: "All statuses" },
  { key: "none", label: "Draft" },
  { key: "pending_review", label: "In Review" },
  { key: "changes_requested", label: "Changes Requested" },
  { key: "approved", label: "Approved" },
  { key: "archived", label: "Archived" },
];

/**
 * Project → Creative Workspace. The primary place a team starts
 * creative work on a project — assets grouped by stage (like Krock),
 * with search/filter/sort/grid-list, real Firebase Storage uploads
 * with progress, and every downstream integration (Files, Reviews,
 * Comments, Tasks, Activity, Downloads) wired through the SAME
 * services those modules already use. Opening an asset navigates to
 * the full-screen Creative Review Workspace
 * (projects/[projectId]/workspace/[stageId]/files/[fileId]) instead
 * of a modal.
 */
export function CreativeWorkspaceTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { project, options } = useProjectDetailsContext();
  const { files, isLoading: isLoadingFiles } = useFiles(projectId);
  const { stages, isLoading: isLoadingStages } = useStages(projectId);
  const fileActions = useFileActions();
  const stageActions = useStageActions();
  const toast = useToast();

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isStageFormOpen, setIsStageFormOpen] = useState(false);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [uploadStageOverride, setUploadStageOverride] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Stage | null>(null);
  const [moveToStageId, setMoveToStageId] = useState<string>("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const migratedOrphansRef = useRef(false);

  // If the review workspace's "Back" button linked here with ?stage=, pre-select that stage's filter.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("stage");
    if (fromQuery) setActiveStageId(fromQuery);
  }, []);

  // One-time, idempotent cleanup for assets uploaded before every
  // upload was guaranteed a stage (see fileService.uploadProjectFile).
  // Silent by design (no popup) — the next time this project's
  // Creative Workspace loads, any stageId:null file is attached to
  // the project's existing/default stage using the exact same
  // real Firestore-write path (fileActions.assignToStage) a manual
  // "move to stage" action already uses, so it's subject to the same
  // security rules as everything else — nothing bypassed.
  useEffect(() => {
    if (migratedOrphansRef.current || isLoadingFiles || isLoadingStages) return;
    const orphaned = files.filter((f) => f.stageId === null);
    if (orphaned.length === 0) {
      migratedOrphansRef.current = true;
      return;
    }
    migratedOrphansRef.current = true;
    (async () => {
      let targetStageId = stages[0]?.id ?? null;
      if (!targetStageId) {
        targetStageId = await stageActions.create(projectId, {
          name: "General",
          description: "Default stage for uploads.",
          templateKey: null,
        });
      }
      if (!targetStageId) return;
      for (const file of orphaned) {
        await fileActions.assignToStage(file.id, targetStageId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingFiles, isLoadingStages, files, stages, projectId]);

  const groups = useMemo(() => groupAssetVersions(files), [files]);

  const filteredGroups = useMemo(() => {
    let result = groups;
    if (statusFilter !== "all") result = result.filter((g) => g.latest.reviewStatus === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((g) => g.latest.fileName.toLowerCase().includes(q));
    }
    const sorted = [...result];
    if (sortKey === "name") sorted.sort((a, b) => a.latest.fileName.localeCompare(b.latest.fileName));
    else if (sortKey === "size") sorted.sort((a, b) => b.latest.sizeBytes - a.latest.sizeBytes);
    else sorted.sort((a, b) => (b.latest.createdAt > a.latest.createdAt ? 1 : -1));
    return sorted;
  }, [groups, statusFilter, searchQuery, sortKey]);

  const visibleGroups = activeStageId ? filteredGroups.filter((g) => g.latest.stageId === activeStageId) : filteredGroups;
  const stageAssetCount = (stageId: string) => groups.filter((g) => g.latest.stageId === stageId).length;
  const stagePendingCount = (stageId: string) => groups.filter((g) => g.latest.stageId === stageId && g.latest.reviewStatus === "pending_review").length;
  const stageApprovedCount = (stageId: string) => groups.filter((g) => g.latest.stageId === stageId && g.latest.reviewStatus === "approved").length;

  // Section-grouped view (only meaningful when not already filtered to one stage) — mirrors the Krock-style "ANIMATION / REVIEW / FINAL" home layout.
  const sections = useMemo(() => {
    if (activeStageId) return [{ stage: stages.find((s) => s.id === activeStageId) ?? null, groups: visibleGroups }];
    const byStage = new Map<string, AssetGroup[]>();
    const unassigned: AssetGroup[] = [];
    for (const group of visibleGroups) {
      const stageId = group.latest.stageId;
      if (!stageId) {
        unassigned.push(group);
        continue;
      }
      const existing = byStage.get(stageId);
      if (existing) existing.push(group);
      else byStage.set(stageId, [group]);
    }
    const result: { stage: Stage | null; groups: AssetGroup[] }[] = stages
      .map((stage) => ({ stage, groups: byStage.get(stage.id) ?? [] }))
      .filter((section) => section.groups.length > 0);
    if (unassigned.length > 0) result.push({ stage: null, groups: unassigned });
    return result;
  }, [activeStageId, visibleGroups, stages]);

  function updateQueueItem(id: string, patch: Partial<UploadQueueItem>) {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  // "All stages" is a VIEW/FILTER, never an upload destination — the
  // only way to get a non-null target here is a specific stage tab
  // being active, or the user explicitly choosing one from the
  // "Select a stage to upload" dropdown shown below while on "All
  // stages". This intentionally does NOT fall back to stages[0] —
  // that fallback still exists, but only inside
  // fileService.uploadProjectFile as a last-resort safety net for
  // callers that genuinely have no stage concept (e.g. a project with
  // zero stages). A deliberate upload action from this screen must
  // never silently pick an arbitrary stage.
  const uploadTargetStageId = activeStageId ?? uploadStageOverride;
  const isAllStagesView = activeStageId === null;

  async function handleFiles(fileList: File[]) {
    if (!uploadTargetStageId) {
      toast.error("Select a stage before uploading.");
      return;
    }
    for (const file of fileList) {
      const id = crypto.randomUUID();

      const validationError = getUploadValidationError(file);
      if (validationError) {
        setQueue((prev) => [...prev, { id, file, status: "error", progress: 0, error: validationError }]);
        toast.error(validationError);
        continue;
      }

      setQueue((prev) => [...prev, { id, file, status: "uploading", progress: 0 }]);

      try {
        const fileId = await fileActions.uploadWithProgress(
          projectId,
          file,
          (percent) => updateQueueItem(id, { progress: percent }),
          { stageId: uploadTargetStageId }
        );
        if (fileId) {
          updateQueueItem(id, { status: "success", progress: 100 });
        } else {
          updateQueueItem(id, { status: "error", error: "No active workspace found." });
          toast.error(`"${file.name}" failed to upload: no active workspace found.`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        updateQueueItem(id, { status: "error", error: message });
        toast.error(`"${file.name}" failed to upload: ${message}`);
      }
    }
  }

  function requestArchiveStage(stage: Stage) {
    if (stageAssetCount(stage.id) === 0) {
      void doArchiveStage(stage);
      return;
    }
    setMoveToStageId(stages.find((s) => s.id !== stage.id)?.id ?? "");
    setArchiveTarget(stage);
  }

  async function doArchiveStage(stage: Stage) {
    await stageActions.archive(stage.id);
    toast.success(`Archived "${stage.name}"`);
    if (activeStageId === stage.id) setActiveStageId(null);
  }

  async function confirmMoveThenArchive() {
    if (!archiveTarget) return;
    if (moveToStageId) {
      const assetsInStage = groups.filter((g) => g.latest.stageId === archiveTarget.id);
      for (const group of assetsInStage) {
        await fileActions.assignToStage(group.latest.id, moveToStageId);
      }
    }
    await doArchiveStage(archiveTarget);
    setArchiveTarget(null);
  }

  function openAsset(group: AssetGroup) {
    router.push(fileReviewRoute(projectId, group.latest.stageId ?? "none", group.latest.id));
  }

  const status = options.statuses.find((s) => s.id === project?.statusId);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-theme bg-primary/10 text-primary">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{project?.name} — Creative Workspace</h2>
              <div className="mt-0.5 flex items-center gap-2">
                <ProjectStatusBadge status={status} />
                <span className="text-xs text-foreground-muted">{groups.length} asset{groups.length === 1 ? "" : "s"} · {stages.length} stage{stages.length === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsStageFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Stage
            </Button>
            <Button size="sm" onClick={() => setIsTemplateFormOpen(true)}>
              <LayoutTemplate className="h-4 w-4" />
              Create from Template
            </Button>
          </div>
        </div>
      </Card>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_INPUT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      {!isLoadingStages && stages.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Stages</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveStageId(null)}
              className={cn(
                "flex min-w-[120px] shrink-0 items-center justify-center rounded-theme border px-4 text-sm font-medium transition-colors",
                activeStageId === null ? "border-primary bg-primary/5 text-primary" : "border-border bg-surface text-foreground-muted hover:bg-surface-muted"
              )}
            >
              All stages
            </button>
            {stages.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                assetCount={stageAssetCount(stage.id)}
                pendingCount={stagePendingCount(stage.id)}
                approvedCount={stageApprovedCount(stage.id)}
                isActive={activeStageId === stage.id}
                onClick={() => setActiveStageId(activeStageId === stage.id ? null : stage.id)}
                onRename={(name) => stageActions.rename(stage.id, name)}
                onArchive={() => requestArchiveStage(stage)}
              />
            ))}
          </div>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Selected Stage</h3>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {activeStageId ? stages.find((s) => s.id === activeStageId)?.name ?? "Stage" : "All stages"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAllStagesView && stages.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                <span>Upload to</span>
                <select
                  value={uploadStageOverride ?? ""}
                  onChange={(e) => setUploadStageOverride(e.target.value || null)}
                  className={cn(
                    "h-8 rounded-theme border bg-surface px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50",
                    uploadStageOverride ? "border-border text-foreground" : "border-primary/50 text-foreground-muted"
                  )}
                >
                  <option value="">Select a stage to upload</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Button size="sm" onClick={() => uploadInputRef.current?.click()} disabled={!uploadTargetStageId}>
              <Upload className="h-4 w-4" />
              Upload Files
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <CreativeUploadZone
            onFiles={handleFiles}
            disabled={!uploadTargetStageId}
            disabledMessage="Select a stage above to enable uploads"
          />
        </div>
      </Card>

      {queue.length > 0 && (
        <UploadProgressList items={queue} onDismiss={(id) => setQueue((prev) => prev.filter((q) => q.id !== id))} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="h-9 w-full rounded-theme border border-border bg-surface pl-8 pr-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AssetStatus | "all")}
          className="h-9 rounded-theme border border-border bg-surface px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-theme border border-border bg-surface px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="updated">Recently updated</option>
          <option value="name">Name</option>
          <option value="size">File size</option>
        </select>

        <div className="flex items-center gap-0.5 rounded-theme border border-border p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={cn("rounded-theme p-1.5", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn("rounded-theme p-1.5", viewMode === "list" ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}
            aria-label="List view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isLoadingFiles && visibleGroups.length === 0 ? (
        <EmptyState
          icon={<FileStack className="h-8 w-8" />}
          title="No creative assets yet"
          description="Upload files or drag them into the canvas above to get started."
        />
      ) : isLoadingFiles ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-theme bg-surface-muted" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <div key={section.stage?.id ?? "unassigned"} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  {section.stage?.name ?? "Unassigned"}
                </h3>
                <span className="text-xs text-foreground-muted">({section.groups.length})</span>
              </div>

              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {section.groups.map((group) => (
                    <AssetCard key={group.groupId} group={group} onClick={() => openAsset(group)} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {section.groups.map((group) => (
                    <AssetListRow key={group.groupId} group={group} onClick={() => openAsset(group)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <StageFormModal isOpen={isStageFormOpen} onClose={() => setIsStageFormOpen(false)} projectId={projectId} onCreated={setActiveStageId} />
      <StageFormModal isOpen={isTemplateFormOpen} onClose={() => setIsTemplateFormOpen(false)} projectId={projectId} startWithTemplates onCreated={setActiveStageId} />

      <ConfirmModal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmMoveThenArchive}
        title="This stage isn't empty"
        confirmLabel={moveToStageId ? "Move assets & archive" : "Archive anyway"}
        isDanger={!moveToStageId}
        isSubmitting={stageActions.isSubmitting || fileActions.isSubmitting}
        description={
          archiveTarget && (
            <div className="flex flex-col gap-3">
              <p>
                &quot;{archiveTarget.name}&quot; contains {stageAssetCount(archiveTarget.id)} asset{stageAssetCount(archiveTarget.id) === 1 ? "" : "s"}.
                Archiving it hides it from the stage list — move its assets to another stage first so nothing becomes hard to find.
              </p>
              {stages.filter((s) => s.id !== archiveTarget.id).length > 0 ? (
                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  Move assets to
                  <select
                    value={moveToStageId}
                    onChange={(e) => setMoveToStageId(e.target.value)}
                    className="h-9 rounded-theme border border-border bg-surface px-2.5 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Don&apos;t move — archive anyway</option>
                    {stages.filter((s) => s.id !== archiveTarget.id).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-foreground-muted">There&apos;s no other stage to move them to yet — archiving will leave them in this archived stage.</p>
              )}
            </div>
          )
        }
      />
    </div>
  );
}
