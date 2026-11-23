"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HardDrive } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useFiles } from "@/hooks/useFiles";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useToast } from "@/hooks/useToast";
import { setWorkspaceFileLimit } from "@/services/billingService";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
import { MB, SUPPORTED_CREATIVE_EXTENSIONS, formatFileLimit } from "@/lib/constants/creativeFiles";
import type { WorkspacePlan } from "@/types/workspace.types";

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Settings > Storage. Every number on this page comes from the ONE resolved entitlement policy (EntitlementsContext): the plan or a Super Admin
 * override decides the total storage and the file-size ceiling, the server counter decides what is used. The only thing an owner/admin can edit is
 * their OWN per-file choice, which can only be at or below that ceiling.
 */
export default function StorageSettingsPage() {
  const { isLoading: isLoadingSettings } = useWorkspaceSettings();
  const { files } = useFiles();
  const { entitlements, isLoading: isLoadingEntitlements, error, refresh } = useEntitlements();
  const { canManageWorkspace } = useCurrentMemberRole();
  const toast = useToast();
  // Per-file limit editor: empty = "no workspace-specific limit" (the workspace's entitlement ceiling applies).
  const [limitText, setLimitText] = useState("");
  const [limitUnit, setLimitUnit] = useState<"MB" | "GB">("GB");
  const [isSaving, setIsSaving] = useState(false);

  const configuredMb = entitlements?.files.workspaceConfiguredBytes ? Math.round(entitlements.files.workspaceConfiguredBytes / MB) : null;
  useEffect(() => {
    if (configuredMb !== null) {
      const asGb = configuredMb % 1024 === 0;
      setLimitUnit(asGb ? "GB" : "MB");
      setLimitText(String(asGb ? configuredMb / 1024 : configuredMb));
    } else {
      setLimitText("");
    }
  }, [configuredMb]);

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
    if (!entitlements) return;
    let maxFileSizeMb: number | null = null;
    if (limitText.trim() !== "") {
      const n = Number(limitText);
      const mb = Math.round(limitUnit === "GB" ? n * 1024 : n);
      if (!Number.isFinite(n) || n <= 0 || mb < 1) {
        toast.error("Enter a file size limit of at least 1 MB, or leave it empty.");
        return;
      }
      if (mb * MB > entitlements.files.workspaceCeilingBytes) {
        toast.error(`The most a single file can be in this workspace is ${formatFileLimit(entitlements.files.workspaceCeilingBytes)}. A higher limit is set by your plan, not here.`);
        return;
      }
      maxFileSizeMb = mb;
    }
    setIsSaving(true);
    try {
      await setWorkspaceFileLimit(entitlements.workspaceId, maxFileSizeMb);
      await refresh();
      toast.success("Storage settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoadingSettings || (isLoadingEntitlements && !entitlements)) return <Loader label="Loading storage settings..." />;
  if (!entitlements) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-foreground">Storage</h1>
        <p className="text-sm text-error">{error ?? "Couldn't load this workspace's storage details."}</p>
        <div><Button size="sm" variant="outline" onClick={() => void refresh()}>Try again</Button></div>
      </div>
    );
  }

  const { files: filePolicy, storage } = entitlements;
  const total = storage.limitBytes;
  const percent = total ? Math.min(100, (storage.usedBytes / total) * 100) : 0;
  const planName = PLAN_DISPLAY_NAMES[entitlements.plan as WorkspacePlan] ?? entitlements.plan;
  const dirty = (limitText.trim() === "" ? null : Math.round(limitUnit === "GB" ? Number(limitText) * 1024 : Number(limitText))) !== configuredMb;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Storage</h1>
        <p className="mt-1 text-sm text-foreground-muted">File size limit, total workspace storage, and what is used.</p>
      </div>

      <SettingsSection title="Your storage at a glance" description={`Plan: ${planName}. Total storage and the file size ceiling are set by your plan (or by the platform for this workspace) — see Settings > Billing & Plan.`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-theme border border-border bg-surface p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Maximum file size</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{formatFileLimit(filePolicy.maxFileBytes)}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">The largest <em>one</em> file you can upload.</p>
          </div>
          <div className="rounded-theme border border-border bg-surface p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Workspace storage used</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{formatFileLimit(storage.usedBytes)}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">Across every project.</p>
          </div>
          <div className="rounded-theme border border-border bg-surface p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Total workspace storage</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{total ? formatFileLimit(total) : "Unlimited"}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">{storage.source === "override" ? "Custom limit set by the platform" : "From your plan"}</p>
          </div>
          <div className="rounded-theme border border-border bg-surface p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Storage remaining</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{storage.remainingBytes !== null ? formatFileLimit(storage.remainingBytes) : "Unlimited"}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">{formatFileLimit(storage.usedBytes)} / {total ? formatFileLimit(total) : "unlimited"}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <HardDrive className="h-5 w-5 shrink-0 text-foreground-muted" />
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">
              {formatFileLimit(storage.usedBytes)} of {total ? formatFileLimit(total) : "unlimited"} used{total ? ` (${percent.toFixed(percent < 10 ? 1 : 0)}%)` : ""}
            </p>
            {percent >= 80 && (
              <p className="mt-1 text-xs text-warning">
                Storage is almost full. <Link href={ROUTES.settingsBilling} className="font-medium underline">Upgrade your plan</Link> for more space.
              </p>
            )}
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
        action={canManageWorkspace ? <Button size="sm" onClick={handleSave} isLoading={isSaving} disabled={!dirty}>Save changes</Button> : undefined}
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
                placeholder={`Up to ${formatFileLimit(filePolicy.workspaceCeilingBytes)}`}
                disabled={!canManageWorkspace}
                onChange={(e) => setLimitText(e.target.value)}
              />
              <select
                aria-label="Unit"
                value={limitUnit}
                disabled={!canManageWorkspace}
                onChange={(e) => setLimitUnit(e.target.value as "MB" | "GB")}
                className="h-10 rounded-theme border border-border bg-surface px-2 text-sm text-foreground"
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
              </select>
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">
              Applies to every upload and new version in this workspace, right away. Files up to <span className="font-medium text-foreground">{formatFileLimit(filePolicy.maxFileBytes)}</span> are accepted now
              {filePolicy.source === "workspace" ? " (your own limit)" : filePolicy.source === "override" ? " (set by the platform for this workspace)" : filePolicy.source === "plan" ? " (from your plan)" : ""}.
              You can choose any value up to {formatFileLimit(filePolicy.workspaceCeilingBytes)} — that is the most one file can be in this workspace. It does not change your total workspace storage, which is set by your plan.
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
