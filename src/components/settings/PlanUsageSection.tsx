"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { checkWorkspaceLimit, type WorkspaceLimitMetric } from "@/services/planService";
import { updateWorkspaceLimit } from "@/services/workspaceService";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useToast } from "@/hooks/useToast";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { formatBytes } from "@/lib/utils/fileFormat";
import { Workspace, WorkspacePlanLimits } from "@/types/workspace.types";

const METRICS: { key: WorkspaceLimitMetric; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "projects", label: "Active projects" },
  { key: "storage", label: "Storage" },
  { key: "aiGenerations", label: "AI generations this month" },
];

/**
 * Metrics an owner/admin can set a custom cap for directly HERE, and
 * which `Workspace.limits` field each one writes. Storage and AI
 * generations are deliberately NOT editable from this section — those
 * live on their own dedicated pages (Settings > Storage, Settings >
 * AI) right next to the rest of that feature's configuration, instead
 * of being duplicated here.
 */
const EDITABLE_LIMIT_KEY: Partial<Record<WorkspaceLimitMetric, keyof WorkspacePlanLimits>> = {
  members: "maxMembers",
  projects: "maxProjects",
};

interface UsageRow {
  key: WorkspaceLimitMetric;
  label: string;
  used: number;
  limit: number;
}

/**
 * Mostly a read-only view into the workspace's real plan/limits/usage —
 * see services/planService.ts, the single place that data is computed.
 * No upgrade button, no pricing, no payment flow: this only makes the
 * architecture visible ahead of a future billing integration.
 *
 * Every limit here IS editable (owner/admin only, see
 * EDITABLE_LIMIT_KEY) — every limit check already reads
 * `workspace.limits[key]` (a real per-workspace Firestore field, not
 * the static PLAN_LIMITS table — see planService.ts), so raising a cap
 * here takes effect immediately with no plan/billing change needed.
 * This is how Omtatva Digitals' own operating workspace stays exempt
 * from the plan-tier limits meant for future paying customers once
 * this product is sold as a SaaS — set each limit to Unlimited here
 * rather than the app enforcing a "plan" on its own operator.
 */
export function PlanUsageSection({ workspace }: { workspace: Workspace }) {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { canManageWorkspace } = useCurrentMemberRole();
  const toast = useToast();

  const [editingKey, setEditingKey] = useState<WorkspaceLimitMetric | null>(null);
  const [draftUnlimited, setDraftUnlimited] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all(METRICS.map((m) => checkWorkspaceLimit(workspace, m.key)))
      .then((results) => {
        if (cancelled) return;
        setRows(results.map((r, i) => ({ key: METRICS[i]!.key, label: METRICS[i]!.label, used: r.used, limit: r.limit })));
      })
      .catch((err) => console.error("[PlanUsageSection] failed to load usage:", err))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  function startEditing(row: UsageRow) {
    const unlimited = !Number.isFinite(row.limit);
    setDraftUnlimited(unlimited);
    setDraftValue(unlimited ? "" : String(row.limit));
    setEditingKey(row.key);
  }

  async function saveLimit(row: UsageRow) {
    const limitsKey = EDITABLE_LIMIT_KEY[row.key];
    if (!limitsKey) return;
    const nextLimit = draftUnlimited ? Infinity : Number(draftValue);
    if (!draftUnlimited && (!Number.isFinite(nextLimit) || nextLimit < 1)) {
      toast.error(`Enter a number of 1 or more, or choose Unlimited.`);
      return;
    }
    setIsSaving(true);
    try {
      await updateWorkspaceLimit(workspace.id, limitsKey, nextLimit);
      setRows((prev) => prev?.map((r) => (r.key === row.key ? { ...r, limit: nextLimit } : r)) ?? null);
      toast.success(`${row.label} limit updated`);
      setEditingKey(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the limit");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingsSection
      title="Plan & usage"
      description={
        workspace.subscriptionStatus === "pending_payment" && workspace.pendingPlan
          ? `Currently on ${PLAN_DISPLAY_NAMES[workspace.plan]} limits. Your ${PLAN_DISPLAY_NAMES[workspace.pendingPlan]} plan activates once payment is confirmed.`
          : "Current plan and real usage against its limits. Upgrading isn't available yet."
      }
      action={
        <div className="flex items-center gap-2">
          {workspace.subscriptionStatus === "pending_payment" && workspace.pendingPlan && (
            <Badge variant="warning">{PLAN_DISPLAY_NAMES[workspace.pendingPlan]} pending</Badge>
          )}
          <Badge variant="info">{PLAN_DISPLAY_NAMES[workspace.plan]}</Badge>
        </div>
      }
    >
      {isLoading || !rows ? (
        <p className="text-xs text-foreground-muted">Loading usage...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const isUnlimited = !Number.isFinite(row.limit);
            const percent = isUnlimited ? 0 : Math.min(100, row.limit > 0 ? (row.used / row.limit) * 100 : 100);
            const nearLimit = !isUnlimited && percent >= 90;
            const isEditable = row.key in EDITABLE_LIMIT_KEY;
            const isEditingThisRow = editingKey === row.key;

            return (
              <div key={row.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-foreground-muted">
                    {row.label}
                    {isEditable && canManageWorkspace && !isEditingThisRow && (
                      <button
                        onClick={() => startEditing(row)}
                        className="rounded-theme p-0.5 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                        aria-label={`Edit ${row.label.toLowerCase()} limit`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  <span className={nearLimit ? "font-medium text-error" : "text-foreground-muted"}>
                    {row.key === "storage" ? formatBytes(row.used) : row.used}
                    {" / "}
                    {isUnlimited ? "Unlimited" : row.key === "storage" ? formatBytes(row.limit) : row.limit}
                  </span>
                </div>

                {isEditingThisRow ? (
                  <div className="mt-2 flex flex-col gap-2 rounded-theme border border-border bg-surface-muted/60 p-2.5">
                    <label className="flex items-center gap-1.5 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={draftUnlimited}
                        onChange={(e) => setDraftUnlimited(e.target.checked)}
                        className="accent-primary"
                      />
                      Unlimited {row.label.toLowerCase()}
                    </label>
                    {!draftUnlimited && (
                      <input
                        type="number"
                        min={1}
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        placeholder={`Max ${row.label.toLowerCase()}`}
                        className="h-8 w-full rounded-theme border border-border bg-surface px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    )}
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingKey(null)} disabled={isSaving}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveLimit(row)} isLoading={isSaving}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  !isUnlimited && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className={`h-full rounded-full ${nearLimit ? "bg-error" : "bg-primary"}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}
