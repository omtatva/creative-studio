"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/hooks/useToast";
import { getWorkspaceEntitlements, setEntitlementOverrides } from "@/services/billingService";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { GB, formatFileLimit } from "@/lib/constants/creativeFiles";
import type { WorkspacePlan } from "@/types/workspace.types";
import type { EntitlementSource, WorkspaceEntitlements } from "@/types/entitlements.types";

const BILLING_LABEL: Record<WorkspaceEntitlements["billingSource"], string> = { trial: "Trial", paid: "Paid", manual: "Manual / complimentary", free: "Free" };
const SOURCE_LABEL: Record<EntitlementSource, string> = { plan: "Plan", override: "Override", default: "Default plan", platform: "Platform ceiling", workspace: "Workspace choice" };

const gbText = (bytes: number | null) => (bytes === null ? "" : String(Number((bytes / GB).toFixed(3))));

/**
 * SUPER ADMIN ONLY — the ONE place to raise or lower a workspace's capacity (Super Admin > Customers > a workspace > Plan & entitlements).
 * It shows the resolved entitlements and usage, and edits the three per-workspace overrides: member seats, total storage and the per-file size
 * entitlement. A save is written server-side (/api/billing/set-overrides) and applies at once — no code change, deploy or Firebase rule edit.
 * An empty field means "no override" (the plan applies). The file-size entitlement can only LOWER the platform safety ceiling for that workspace.
 * The Super Admin reads and writes here WITHOUT being a member of the workspace, so it never takes a seat.
 */
export function EntitlementOverridesCard({ workspaceId }: { workspaceId: string }) {
  const toast = useToast();
  const [data, setData] = useState<WorkspaceEntitlements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState("");
  const [storageGb, setStorageGb] = useState("");
  const [fileGb, setFileGb] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = useCallback((e: WorkspaceEntitlements) => {
    setData(e);
    setMembers(e.members?.override !== null && e.members?.override !== undefined ? String(e.members.override) : "");
    setStorageGb(gbText(e.storage.overrideBytes));
    setFileGb(e.files.entitlementBytes !== null && e.files.source === "override" ? gbText(e.files.entitlementBytes) : "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getWorkspaceEntitlements(workspaceId)
      .then((r) => !cancelled && apply(r.entitlements))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load entitlements."));
    return () => {
      cancelled = true;
    };
  }, [workspaceId, apply]);

  if (error) return <SettingsSection title="Plan & entitlements"><p className="text-sm text-error">{error}</p></SettingsSection>;
  if (!data || !data.members) return <SettingsSection title="Plan & entitlements"><p className="text-sm text-foreground-muted">Loading...</p></SettingsSection>;

  const m = data.members;
  const s = data.storage;
  const f = data.files;
  const savedMembers = m.override !== null ? String(m.override) : "";
  const savedStorage = gbText(s.overrideBytes);
  const savedFile = f.source === "override" && f.entitlementBytes !== null ? gbText(f.entitlementBytes) : "";
  const dirty = members !== savedMembers || storageGb !== savedStorage || fileGb !== savedFile;
  const hasOverride = m.override !== null || s.overrideBytes !== null || savedFile !== "";
  const notEntitled = data.billingSource === "free" && hasOverride;

  function parse(text: string, factor: number): number | null | "invalid" {
    if (text.trim() === "") return null;
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) return "invalid";
    return Math.round(n * factor);
  }

  async function save() {
    const pm = parse(members, 1);
    const ps = parse(storageGb, GB);
    const pf = parse(fileGb, GB);
    if (pm === "invalid" || ps === "invalid" || pf === "invalid") {
      toast.error("Enter positive numbers, or leave a field empty to remove its override.");
      return;
    }
    const changes: { maxMembers?: number | null; maxStorageBytes?: number | null; maxFileEntitlementBytes?: number | null } = {};
    if (members !== savedMembers) changes.maxMembers = pm;
    if (storageGb !== savedStorage) changes.maxStorageBytes = ps;
    if (fileGb !== savedFile) changes.maxFileEntitlementBytes = pf;
    setSaving(true);
    try {
      apply(await setEntitlementOverrides(workspaceId, changes));
      toast.success("Overrides saved — the workspace uses them immediately");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the overrides.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      title="Plan & entitlements"
      description="What this workspace gets and uses. An override replaces the plan value for this workspace only and applies immediately; leave a field empty to use the plan."
      action={<Button size="sm" onClick={save} isLoading={saving} disabled={!dirty}>Save overrides</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="info">{PLAN_DISPLAY_NAMES[data.plan as WorkspacePlan] ?? data.plan}</Badge>
        <Badge>{BILLING_LABEL[data.billingSource]}</Badge>
        <Badge variant={data.subscriptionStatus === "active" || data.subscriptionStatus === "trialing" ? "success" : "warning"}>{data.subscriptionStatus}</Badge>
      </div>
      {notEntitled && <p className="mb-3 rounded-theme bg-warning/10 px-3 py-2 text-xs text-foreground">Overrides only apply while the subscription is active or on trial. This workspace is currently on free limits, so the stored overrides are not in effect.</p>}
      {data.malformedOverrides.length > 0 && <p className="mb-3 rounded-theme bg-warning/10 px-3 py-2 text-xs text-foreground">Ignored malformed override values: {data.malformedOverrides.join(", ")}. The plan values apply for those.</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Member seats</p>
          <p className="text-xs text-foreground-muted">
            {m.used} used · plan {m.planLimit ?? "unlimited"} · effective <span className="font-medium text-foreground">{m.limit ?? "unlimited"}</span> ({SOURCE_LABEL[m.source]})
            {m.remaining !== null ? ` · ${m.remaining} remaining` : ""}
          </p>
          <p className="text-xs text-foreground-muted">
            Active: owner {m.byRole.owner} · admin {m.byRole.admin} · member {m.byRole.member} · viewer {m.byRole.viewer}
            {m.disabled > 0 ? ` · ${m.disabled} disabled (no seat)` : ""} · {m.pendingInvites} pending invite{m.pendingInvites === 1 ? "" : "s"} (no seat yet)
          </p>
          <Input aria-label="Member seat override" type="number" min={1} step={1} value={members} placeholder="No override" onChange={(e) => setMembers(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Total storage (GB)</p>
          <p className="text-xs text-foreground-muted">
            {formatFileLimit(s.usedBytes)} used · plan {s.planLimitBytes ? formatFileLimit(s.planLimitBytes) : "unlimited"} · effective <span className="font-medium text-foreground">{s.limitBytes ? formatFileLimit(s.limitBytes) : "unlimited"}</span> ({SOURCE_LABEL[s.source]})
            {s.remainingBytes !== null ? ` · ${formatFileLimit(s.remainingBytes)} remaining` : ""}
          </p>
          <Input aria-label="Total storage override in GB" type="number" min={1} step="any" value={storageGb} placeholder="No override" onChange={(e) => setStorageGb(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Max file-size entitlement (GB)</p>
          <p className="text-xs text-foreground-muted">
            Platform safety ceiling {formatFileLimit(f.platformCeilingBytes)} · entitlement {f.entitlementBytes ? formatFileLimit(f.entitlementBytes) : "none"} · effective for uploads <span className="font-medium text-foreground">{formatFileLimit(f.maxFileBytes)}</span> ({SOURCE_LABEL[f.source]})
          </p>
          <p className="text-xs text-foreground-muted">{f.workspaceConfiguredBytes ? `The workspace owner chose ${formatFileLimit(f.workspaceConfiguredBytes)} within this.` : "The workspace owner has not chosen a lower limit."}</p>
          <Input aria-label="Maximum file size entitlement override in GB" type="number" min={0.001} step="any" value={fileGb} placeholder={`No override (${formatFileLimit(f.platformCeilingBytes)} ceiling)`} onChange={(e) => setFileGb(e.target.value)} />
        </div>
      </div>
    </SettingsSection>
  );
}
