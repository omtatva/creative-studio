"use client";

import { useState } from "react";
import { ChevronDown, Download, File, Paperclip, Trash2, Upload } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { useAttachments } from "@/hooks/useAttachments";
import { useTaskActions } from "@/hooks/useTaskActions";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/** Upload/preview/download with version history — uploading a file with a matching name adds a new version instead of a duplicate row (see attachmentService.uploadAttachment). */
export function TaskAttachmentsTab() {
  const { task } = useTaskDetailsContext();
  const { attachments, isLoading } = useAttachments(task?.id);
  const actions = useTaskActions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);

  if (!task) return null;

  async function handleUpload(files: FileList | null) {
    if (!files || !task) return;
    for (const file of Array.from(files)) {
      await actions.uploadAttachment(task.id, file);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attachments</CardTitle>
        <label>
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-theme bg-primary px-4 text-sm font-medium text-white hover:opacity-90">
            <Upload className="h-4 w-4" />
            Upload
          </span>
          <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        </label>
      </CardHeader>

      {!isLoading && attachments.length === 0 ? (
        <EmptyState icon={<Paperclip className="h-8 w-8" />} title="No attachments yet" description="Upload files relevant to this task." className="py-8" />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {attachments.map((attachment) => {
            const current = attachment.versions[attachment.versions.length - 1];
            if (!current) return null;
            const extension = attachment.fileName.split(".").pop()?.toLowerCase() ?? "";
            const isImage = IMAGE_EXTENSIONS.includes(extension);
            const isExpanded = expandedId === attachment.id;

            return (
              <div key={attachment.id} className="py-3">
                <div className="flex items-center gap-3">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.url} alt={attachment.fileName} className="h-10 w-10 rounded-theme object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-theme bg-surface-muted text-foreground-muted">
                      <File className="h-4.5 w-4.5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{attachment.fileName}</p>
                    <p className="text-xs text-foreground-muted">
                      {formatBytes(current.sizeBytes)} · v{current.versionNumber} · uploaded by {current.uploadedBy.displayName}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {attachment.versions.length > 1 && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : attachment.id)}
                        className="flex items-center gap-1 rounded-theme px-2 py-1 text-xs text-foreground-muted hover:bg-surface-muted"
                      >
                        {attachment.versions.length} versions
                        <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    )}
                    <a href={current.url} download={attachment.fileName} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Download">
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => setDeleteTarget({ id: attachment.id, fileName: attachment.fileName })}
                      className="rounded-theme p-1.5 text-foreground-muted hover:bg-error/10 hover:text-error"
                      aria-label="Delete attachment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="ml-13 mt-2 flex flex-col gap-1.5 border-l border-border pl-4">
                    {[...attachment.versions].reverse().map((version) => (
                      <div key={version.versionNumber} className="flex items-center justify-between text-xs text-foreground-muted">
                        <span>
                          v{version.versionNumber} · {formatBytes(version.sizeBytes)} · {version.uploadedBy.displayName}
                        </span>
                        <a href={version.url} download={attachment.fileName} className="text-primary hover:underline">
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await actions.deleteAttachment(task!.id, deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete attachment?"
        description={`This permanently deletes "${deleteTarget?.fileName}" and all its versions. This can't be undone.`}
        confirmLabel="Delete"
        isDanger
        isSubmitting={actions.isSubmitting}
      />
    </Card>
  );
}
