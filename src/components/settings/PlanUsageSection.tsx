"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { checkWorkspaceLimit, type WorkspaceLimitMetric } from "@/services/planService";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { planHeadline, resolveBillingView, getPlanRequest } from "@/lib/billingDisplay";
import { useBillingCacheResync } from "@/hooks/useBillingCacheResync";
import { formatBytes } from "@/lib/utils/fileFormat";
import type { Workspace } from "@/types/workspace.types";
import type { WorkspaceSubscription } from "@/types/billing.types";

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
 * Read-only view into the workspace's plan and real usage — see
 * services/planService.ts, the single place that data is computed.
 *
 * Limits are NOT editable here (or anywhere on the client): `plan`,
 * `limits`, `subscriptionStatus`, `pendingPlan` and `trialEnd` on the
 * workspace doc are a server-controlled display cache (see
 * firestore.rules), and what a workspace is actually entitled to comes
 * from its subscription via resolveEntitlements. A workspace that
 * needs different limits (e.g. Omtatva's own operating workspace) gets
 * them through Super Admin > Billing — a manual/complimentary
 * activation — not by editing a number here.
 *
 * `subscription` (when the caller has it — owner/admin billing views)
 * makes the plan badge exact. Without it (a plain member can't read
 * subscriptions) the badge uses the workspace cache, which the
 * workspace context has already verified against the authoritative
 * subscription server-side this session, and which never shows an
 * unverifiable trial as active.
 */
export function PlanUsageSection({ workspace, subscription }: { workspace: Workspace; subscription?: WorkspaceSubscription | null }) {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useBillingCacheResync(workspace, subscription);

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

  const view = resolveBillingView(workspace, subscription);
  const request = getPlanRequest(workspace, subscription);

  return (
    <SettingsSection
      title="Plan & usage"
      description={
        request
          ? `Currently on ${PLAN_DISPLAY_NAMES[view.plan]} limits. Your ${PLAN_DISPLAY_NAMES[request.planId]} plan activates once payment is confirmed.`
          : "Current plan and real usage against its limits."
      }
      action={
        <div className="flex items-center gap-2">
          {request && <Badge variant="warning">{PLAN_DISPLAY_NAMES[request.planId]} requested</Badge>}
          {view.trialExpired && <Badge variant="warning">Trial expired</Badge>}
          <Badge variant="info">{planHeadline(view.plan, view.isTrialing)}</Badge>
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
                    <div className={`h-full rounded-full ${nearLimit ? "bg-error" : "bg-primary"}`} style={{ width: `${percent}%` }} />
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
