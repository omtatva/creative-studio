"use client";

import { useState } from "react";
import { Archive, ArrowLeft, Download, FolderInput, Link2, ListPlus, MoreHorizontal, PanelRight, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusDropdown } from "./StatusDropdown";
import { VersionDropdown } from "./VersionDropdown";
import { cn } from "@/lib/utils/cn";
import { ProjectFile } from "@/types/file.types";
import { AssetStatusOption } from "@/types/settings.types";
import { Stage } from "@/types/stage.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface ReviewToolbarProps {
  asset: ProjectFile;
  projectName: string;
  stageName: string | null;
  versions: ProjectFile[];
  onSelectVersion: (v: ProjectFile) => void;
  onBack: () => void;
  onShare: () => void;
  onUploadVersion: () => void;
  isUploadingVersion: boolean;
  uploadProgress: number;
  onSendForReview: () => void;
  onCreateTask: () => void;
  onDownload: () => void;
  onArchive: () => void;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  stages: Stage[];
  currentStageId: string | null;
  onMoveToStage: (stageId: string | null) => void;
  statuses: AssetStatusOption[];
  canEditStatuses: boolean;
  onSelectStatus: (option: AssetStatusOption) => void;
  onOpenEditStatuses: () => void;
}

/** Top toolbar — Back | File Name | Version Selector | Status | Share | More, per the full-screen layout spec. */
export function ReviewToolbar({
  asset,
  projectName,
  stageName,
  versions,
  onSelectVersion,
  onBack,
  onShare,
  onUploadVersion,
  isUploadingVersion,
  uploadProgress,
  onSendForReview,
  onCreateTask,
  onDownload,
  onArchive,
  isPanelOpen,
  onTogglePanel,
  stages,
  currentStageId,
  onMoveToStage,
  statuses,
  canEditStatuses,
  onSelectStatus,
  onOpenEditStatuses,
}: ReviewToolbarProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const moreRef = useDismissableMenu<HTMLDivElement>(isMoreOpen, () => {
    setIsMoreOpen(false);
    setIsMoveOpen(false);
  });

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <button onClick={onBack} className="flex items-center gap-1.5 rounded-theme px-2 py-1.5 text-sm font-medium text-foreground-muted hover:bg-surface-muted" aria-label="Back">
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Back</span>
      </button>

      <div className="h-5 w-px bg-border" />

      <div className="hidden min-w-0 items-center gap-1.5 text-sm text-foreground-muted lg:flex">
        <span className="max-w-[140px] truncate" title={projectName}>{projectName}</span>
        {stageName && (
          <>
            <span className="text-foreground-muted/50">/</span>
            <span className="max-w-[120px] truncate" title={stageName}>{stageName}</span>
          </>
        )}
        <span className="text-foreground-muted/50">/</span>
      </div>

      <p className="min-w-0 max-w-[220px] truncate text-sm font-semibold text-foreground sm:max-w-xs" title={asset.fileName}>
        {asset.fileName}
      </p>

      <VersionDropdown versions={versions} active={asset} onSelect={onSelectVersion} />

      <StatusDropdown
        currentStatusId={asset.statusId}
        statuses={statuses}
        canEdit={canEditStatuses}
        onSelect={onSelectStatus}
        onOpenEditStatuses={onOpenEditStatuses}
      />

      <div className="flex-1" />

      <div className="hidden items-center gap-1.5 md:flex">
        <Button size="sm" variant="outline" onClick={onUploadVersion} isLoading={isUploadingVersion}>
          <Upload className="h-3.5 w-3.5" />
          {isUploadingVersion ? `${uploadProgress}%` : "New version"}
        </Button>
        <Button size="sm" variant="outline" onClick={onSendForReview} disabled={asset.reviewStatus === "archived"}>
          <Send className="h-3.5 w-3.5" />
          Send for Review
        </Button>
        <Button size="sm" variant="outline" onClick={onCreateTask}>
          <ListPlus className="h-3.5 w-3.5" />
          Create Task
        </Button>
      </div>

      <button onClick={onShare} className="rounded-theme p-2 text-foreground-muted hover:bg-surface-muted" aria-label="Share">
        <Link2 className="h-4 w-4" />
      </button>

      <button
        onClick={onTogglePanel}
        className={cn("rounded-theme p-2 text-foreground-muted hover:bg-surface-muted", isPanelOpen && "bg-surface-muted text-foreground")}
        aria-label="Toggle review panel"
      >
        <PanelRight className="h-4 w-4" />
      </button>

      <div ref={moreRef} className="relative">
        <button onClick={() => setIsMoreOpen((v) => !v)} className="rounded-theme p-2 text-foreground-muted hover:bg-surface-muted" aria-label="More">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {isMoreOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-theme border border-border bg-surface py-1 shadow-soft-lg">
            <a
              href={asset.url}
              download={asset.fileName}
              onClick={() => {
                onDownload();
                setIsMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
            >
              <Download className="h-4 w-4" /> Download
            </a>
            <button
              onClick={() => {
                onUploadVersion();
                setIsMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted md:hidden"
            >
              <Upload className="h-4 w-4" /> Upload new version
            </button>
            <button
              onClick={() => {
                onSendForReview();
                setIsMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted md:hidden"
            >
              <Send className="h-4 w-4" /> Send for Review
            </button>
            <button
              onClick={() => {
                onCreateTask();
                setIsMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted md:hidden"
            >
              <ListPlus className="h-4 w-4" /> Create Task
            </button>
            {stages.length > 0 && (
              <div className="border-t border-border">
                <button
                  onClick={() => setIsMoveOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                >
                  <FolderInput className="h-4 w-4" /> Move to stage
                </button>
                {isMoveOpen && (
                  <div className="max-h-40 overflow-y-auto pb-1">
                    {stages.map((stage) => (
                      <button
                        key={stage.id}
                        onClick={() => {
                          onMoveToStage(stage.id);
                          setIsMoreOpen(false);
                          setIsMoveOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left text-sm hover:bg-surface-muted",
                          stage.id === currentStageId ? "font-semibold text-primary" : "text-foreground-muted"
                        )}
                      >
                        {stage.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => {
                onArchive();
                setIsMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-muted hover:bg-error/10 hover:text-error"
            >
              <Archive className="h-4 w-4" /> Archive
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
