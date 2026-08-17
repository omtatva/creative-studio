"use client";

import { useMemo, useRef } from "react";
import { Upload, Paperclip } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileRow } from "./FileRow";
import { useFiles } from "@/hooks/useFiles";
import { useFileActions } from "@/hooks/useFileActions";
import { groupAssetVersions } from "@/lib/utils/assetVersions";

interface FilesPanelProps {
  projectId?: string; // omit for the workspace-wide /files page
  showProjectLink?: boolean;
}

/**
 * Reusable Files list + uploader. Used at the workspace-wide /files
 * page (all projects) AND the Projects module's own Files tab
 * (scoped to one project) — same component, different `projectId`.
 * When scoped, "Upload" needs a target project, so this component
 * requires `projectId` to actually upload (the workspace-wide view
 * is read/download/delete only, matching how a shared drive works).
 */
export function FilesPanel({ projectId, showProjectLink }: FilesPanelProps) {
  const { files, isLoading } = useFiles(projectId);
  const actions = useFileActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupAssetVersions(files), [files]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || !projectId) return;
    for (const file of Array.from(fileList)) {
      await actions.upload(projectId, file);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Files</CardTitle>
        {projectId && (
          <>
            <Button size="sm" onClick={() => inputRef.current?.click()} isLoading={actions.isSubmitting}>
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
          </>
        )}
      </CardHeader>

      {!isLoading && files.length === 0 ? (
        <EmptyState icon={<Paperclip className="h-8 w-8" />} title="No files yet" description="Files uploaded to this project will show up here." />
      ) : (
        <div className="flex flex-col gap-2">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 w-full animate-pulse rounded-theme bg-surface-muted" />)
            : groups.map((group) => (
                <FileRow
                  key={group.groupId}
                  file={group.latest}
                  previousVersions={group.versions.filter((v) => v.id !== group.latest.id)}
                  showProjectLink={showProjectLink}
                  onDelete={(f) => actions.remove(f.id)}
                />
              ))}
        </div>
      )}
    </Card>
  );
}
