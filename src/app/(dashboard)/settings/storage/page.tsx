"use client";

import { useEffect, useMemo, useState } from "react";
import { HardDrive } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { TagsInput } from "@/components/projects/TagsInput";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useFiles } from "@/hooks/useFiles";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_STORAGE_SETTINGS } from "@/lib/constants/settingsDefaults";
import { StorageSettings } from "@/types/settings.types";

function formatGb(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}
function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Analytics breakdown is derived client-side from the real `files` collection (useFiles) — no separate analytics collection needed. */
export default function StorageSettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const { files } = useFiles();
  const toast = useToast();
  const [draft, setDraft] = useState<StorageSettings>(DEFAULT_STORAGE_SETTINGS);

  useEffect(() => {
    if (settings) setDraft(settings.storage ?? DEFAULT_STORAGE_SETTINGS);
  }, [settings]);

  const byType = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const file of files) {
      const key = file.contentType.split("/")[0] || "other";
      groups[key] = (groups[key] ?? 0) + file.sizeBytes;
    }
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [files]);

  const totalUsed = byType.reduce((sum, [, bytes]) => sum + bytes, 0);

  async function handleSave() {
    if (draft.maxUploadSizeMb < 1) {
      toast.error("Max upload size must be at least 1 MB");
      return;
    }
    try {
      await save({ storage: draft });
      toast.success("Storage settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    }
  }

  if (isLoading) return <Loader label="Loading storage settings..." />;

  const percent = Math.min(100, (draft.usedBytes / draft.limitBytes) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Storage</h1>
        <p className="mt-1 text-sm text-foreground-muted">Usage, upload limits, and allowed file types.</p>
      </div>

      <SettingsSection title="Usage">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-foreground-muted" />
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">
              {formatGb(draft.usedBytes)} GB of {formatGb(draft.limitBytes)} GB used
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Storage analytics" description="Breakdown of uploaded files by type.">
        {byType.length === 0 ? (
          <p className="text-sm text-foreground-muted">No files uploaded yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {byType.map(([type, bytes]) => (
              <div key={type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="capitalize text-foreground">{type}</span>
                  <span className="text-foreground-muted">{formatMb(bytes)} MB</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${totalUsed ? (bytes / totalUsed) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Upload limits"
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving}>Save changes</Button>}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Max upload size (MB)"
            type="number"
            min={1}
            value={draft.maxUploadSizeMb}
            onChange={(e) => setDraft({ ...draft, maxUploadSizeMb: Number(e.target.value) })}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Allowed file types</p>
            <TagsInput value={draft.allowedFileTypes} onChange={(types) => setDraft({ ...draft, allowedFileTypes: types })} placeholder="extension, then Enter" />
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
