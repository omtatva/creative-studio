"use client";

import { useEffect, useMemo, useState } from "react";
import { HardDrive } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useFiles } from "@/hooks/useFiles";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/useToast";
import { checkWorkspaceLimit } from "@/services/planService";
import { DEFAULT_STORAGE_SETTINGS } from "@/lib/constants/settingsDefaults";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";
import { MB, MAX_UPLOAD_SIZE_BYTES, SUPPORTED_CREATIVE_EXTENSIONS, effectiveMaxFileBytes, formatFileLimit } from "@/lib/constants/creativeFiles";
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
  const { workspace } = useWorkspaceContext();
  const toast = useToast();
  const [draft, setDraft] = useState<StorageSettings>(DEFAULT_STORAGE_SETTINGS);
  // Per-file limit editor: empty = "no workspace limit" (the platform ceiling still applies).
  const [limitText, setLimitText] = useState("");
  const [limitUnit, setLimitUnit] = useState<"MB" | "GB">("GB");

  useEffect(() => {
    if (settings) setDraft(settings.storage ?? DEFAULT_STORAGE_SETTINGS);
    const mb = settings?.storage?.maxFileSizeMb;
    if (typeof mb === "number" && mb > 0) {
      const asGb = mb % 1024 === 0;
      setLimitUnit(asGb ? "GB" : "MB");
      setLimitText(String(asGb ? mb / 1024 : mb));
    } else {
      setLimitText("");
    }
  }, [settings]);

  // Plan storage limit (see planService.ts / PlanUsageSection) — a
  // SEPARATE field from the `settings.storage` upload-preferences doc above.
  // Read-only: it follows the workspace's plan, which is server-controlled.
  const [planLimit, setPlanLimit] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    if (!workspace) return;
    checkWorkspaceLimit(workspace, "storage")
      .then((r) => setPlanLimit({ used: r.used, limit: r.limit }))
      .catch((err) => console.error("[settings/storage] failed to load plan limit:", err));
  }, [workspace]);

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
    let maxFileSizeMb: number | null = null;
    if (limitText.trim() !== "") {
      const n = Number(limitText);
      const mb = Math.round(limitUnit === "GB" ? n * 1024 : n);
      if (!Number.isFinite(n) || n <= 0 || mb < 1) {
        toast.error("Enter a file size limit of at least 1 MB, or leave it empty for no workspace limit.");
        return;
      }
      if (mb * MB > MAX_UPLOAD_SIZE_BYTES) {
        toast.error(`The most a single file can be is ${formatFileLimit(MAX_UPLOAD_SIZE_BYTES)}.`);
        return;
      }
      maxFileSizeMb = mb;
    }
    try {
      await save({ storage: { ...draft, maxFileSizeMb } });
      toast.success("Storage settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    }
  }

  if (isLoading) return <Loader label="Loading storage settings..." />;

  // The limit shown is the PLAN's (what uploads are actually checked against), and "used" is the server-maintained counter when present.
  const planStorageLimit = workspace?.limits?.maxStorageBytes ?? draft.limitBytes;
  const counter = (workspace as unknown as { storageBytesUsed?: number } | null)?.storageBytesUsed;
  const usedNow = typeof counter === "number" ? counter : draft.usedBytes;
  const percent = Number.isFinite(planStorageLimit) ? Math.min(100, (usedNow / planStorageLimit) * 100) : 0;
  const effectiveFileLimit = effectiveMaxFileBytes(settings?.storage?.maxFileSizeMb);
  const remaining = Number.isFinite(planStorageLimit) ? Math.max(0, planStorageLimit - usedNow) : Infinity;

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
              {formatGb(usedNow)} GB of {Number.isFinite(planStorageLimit) ? `${formatGb(planStorageLimit)} GB` : "unlimited"} used
            </p>
            {percent >= 80 && (
              <p className="mt-1 text-xs text-warning">
                Storage is almost full. <Link href={ROUTES.settingsBilling} className="font-medium underline">Upgrade your plan</Link> for more space.
              </p>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Workspace storage limit"
        description="The storage cap for your plan, enforced before an upload is allowed. It follows your plan — see Settings > Billing & Plan."
      >
        {!planLimit ? (
          <p className="text-xs text-foreground-muted">Loading...</p>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-foreground-muted">Storage limit</span>
              <span className="text-foreground-muted">
                {formatGb(planLimit.used)} GB / {Number.isFinite(planLimit.limit) ? `${formatGb(planLimit.limit)} GB` : "Unlimited"}
              </span>
            </div>
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
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Maximum size of a single file</p>
            <div className="flex gap-2">
              <Input
                aria-label="Maximum file size"
                type="number"
                min={1}
                value={limitText}
                placeholder="No workspace limit"
                onChange={(e) => setLimitText(e.target.value)}
              />
              <select
                aria-label="Unit"
                value={limitUnit}
                onChange={(e) => setLimitUnit(e.target.value as "MB" | "GB")}
                className="h-10 rounded-theme border border-border bg-surface px-2 text-sm text-foreground"
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
              </select>
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">
              Applies to every upload and new version in this workspace, right away. Currently uploads up to <span className="font-medium text-foreground">{formatFileLimit(effectiveFileLimit)}</span> are accepted
              {Number.isFinite(remaining) ? `, and your plan has ${formatFileLimit(remaining)} of storage left` : ""}. The most a single file can ever be is {formatFileLimit(MAX_UPLOAD_SIZE_BYTES)}; your plan&apos;s total storage is separate and set by your plan.
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Supported file types</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(SUPPORTED_CREATIVE_EXTENSIONS).map((ext) => (
                <span key={ext} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-foreground">.{ext}</span>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">Information only. These are the video, image, PDF and audio types the app accepts for creative files; they are the same for every workspace and cannot be changed here.</p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
