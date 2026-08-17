"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { checkWorkspaceLimit, type WorkspaceLimitMetric } from "@/services/planService";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { formatBytes } from "@/lib/utils/fileFormat";
import { Workspace } from "@/types/workspace.types";

const METRICS: { key: WorkspaceLimitMetric; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "projects", label: "Active projects" },
  { key: "storage", label: "Storage" },
  { key: "aiGenerations", label: "AI generations this month" },
];

interface UsageRow {
  key: WorkspaceLimitMetric;
  label: string;
  used: number;
  limit: number;
}

/**
 * Read-only view into the workspace's real plan/limits/usage — see
 * services/planService.ts, the single place that data is computed.
 * No upgrade button, no pricing, no payment flow: this only makes the
 * architecture visible ahead of a future billing integration.
 */
export function PlanUsageSection({ workspace }: { workspace: Workspace }) {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
            return (
              <div key={row.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-foreground-muted">{row.label}</span>
                  <span className={nearLimit ? "font-medium text-error" : "text-foreground-muted"}>
                    {row.key === "storage" ? formatBytes(row.used) : row.used}
                    {" / "}
                    {isUnlimited ? "Unlimited" : row.key === "storage" ? formatBytes(row.limit) : row.limit}
                  </span>
                </div>
                {!isUnlimited && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={`h-full rounded-full ${nearLimit ? "bg-error" : "bg-primary"}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}
