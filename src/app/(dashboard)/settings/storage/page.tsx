"use client";

import { useEffect, useMemo, useState } from "react";
import { HardDrive, Pencil } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { TagsInput } from "@/components/projects/TagsInput";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useFiles } from "@/hooks/useFiles";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useToast } from "@/hooks/useToast";
import { checkWorkspaceLimit } from "@/services/planService";
import { updateWorkspaceLimit } from "@/services/workspaceService";
import { DEFAULT_STORAGE_SETTINGS } from "@/lib/constants/settingsDefaults";
import { StorageSettings } from "@/types/settings.types";

const BYTES_PER_GB = 1024 * 1024 * 1024;

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
  const { workspace } = useWorkspaceContext();
  const { canManageWorkspace } = useCurrentMemberRole();
  const toast = useToast();
  const [draft, setDraft] = useState<StorageSettings>(DEFAULT_STORAGE_SETTINGS);

  useEffect(() => {
    if (settings) setDraft(settings.storage ?? DEFAULT_STORAGE_SETTINGS);
  }, [settings]);

  // Real per-workspace plan limit (see planService.ts / PlanUsageSection) — a
  // SEPARATE field from the `settings.storage` upload-preferences doc above;
  // this is the number checkWorkspaceLimit actually enforces before an
  // upload is allowed to proceed.
  const [planLimit, setPlanLimit] = useState<{ used: number; limit: number } | null>(null);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitUnlimited, setLimitUnlimited] = useState(false);
  const [limitDraftGb, setLimitDraftGb] = useState("");
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    checkWorkspaceLimit(workspace, "storage")
      .then((r) => setPlanLimit({ used: r.used, limit: r.limit }))
      .catch((err) => console.error("[settings/storage] failed to load plan limit:", err));
  }, [workspace]);

  function startEditingLimit() {
    if (!planLimit) return;
    const unlimited = !Number.isFinite(planLimit.limit);
    setLimitUnlimited(unlimited);
    setLimitDraftGb(unlimited ? "" : String(planLimit.limit / BYTES_PER_GB));
    setIsEditingLimit(true);
  }

  async function saveLimit() {
    if (!workspace) return;
    const rawGb = Number(limitDraftGb);
    if (!limitUnlimited && (!Number.isFinite(rawGb) || rawGb < 1)) {
      toast.error("Enter a number of 1 or more GB, or choose Unlimited.");
      return;
    }
    const nextLimit = limitUnlimited ? Infinity : Math.round(rawGb * BYTES_PER_GB);
    setIsSavingLimit(true);
    try {
      await updateWorkspaceLimit(workspace.id, "maxStorageBytes", nextLimit);
      setPlanLimit((prev) => (prev ? { ...prev, limit: nextLimit } : prev));
      toast.success("Storage limit updated");
      setIsEditingLimit(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the limit");
    } finally {
      setIsSavingLimit(false);
    }
  }

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

      <SettingsSection
        title="Workspace storage limit"
        description="The real cap enforced before an upload is allowed — see Settings > Workspace for every other plan limit."
      >
        {!planLimit ? (
          <p className="text-xs text-foreground-muted">Loading...</p>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-foreground-muted">
                Storage limit
                {canManageWorkspace && !isEditingLimit && (
                  <button
                    onClick={startEditingLimit}
                    className="rounded-theme p-0.5 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                    aria-label="Edit storage limit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </span>
              <span className="text-foreground-muted">
                {formatGb(planLimit.used)} GB / {Number.isFinite(planLimit.limit) ? `${formatGb(planLimit.limit)} GB` : "Unlimited"}
              </span>
            </div>

            {isEditingLimit && (
              <div className="mt-2 flex flex-col gap-2 rounded-theme border border-border bg-surface-muted/60 p-2.5">
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <input type="checkbox" checked={limitUnlimited} onChange={(e) => setLimitUnlimited(e.target.checked)} className="accent-primary" />
                  Unlimited storage
                </label>
                {!limitUnlimited && (
                  <input
                    type="number"
                    min={1}
                    step="0.1"
                    value={limitDraftGb}
                    onChange={(e) => setLimitDraftGb(e.target.value)}
                    placeholder="Max storage (GB)"
                    className="h-8 w-full rounded-theme border border-border bg-surface px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsEditingLimit(false)} disabled={isSavingLimit}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveLimit} isLoading={isSavingLimit}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
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
