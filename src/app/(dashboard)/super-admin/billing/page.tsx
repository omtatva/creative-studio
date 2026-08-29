"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Pause, Play, XCircle } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getAllWorkspaceSubscriptions } from "@/services/subscriptionService";
import { setSubscriptionStatus, activatePlanManually } from "@/services/billingService";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/entitlements";
import { PLAN_DISPLAY_NAMES, PLAN_ORDER } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils/date";
import type { WorkspaceSubscription, SubscriptionStatus } from "@/types/billing.types";
import type { Workspace, WorkspacePlan } from "@/types/workspace.types";

const CHOOSABLE_PLANS = PLAN_ORDER.filter((p) => p !== "enterprise") as Exclude<WorkspacePlan, "enterprise">[];

interface Row {
  workspace: Workspace;
  subscription: WorkspaceSubscription | null;
}

/**
 * Super Admin > Billing — every workspace's subscription in one place
 * (Section "BILLING": view all subscriptions/plans/status, activate/
 * change/suspend/reactivate/cancel). A workspace with no subscription
 * doc yet (brand new, never activated) falls back to its own cached
 * `plan`/`subscriptionStatus` fields — see getAllWorkspaceSubscriptions'
 * doc comment for why that doc can legitimately not exist yet.
 */
export default function SuperAdminBillingPage() {
  const { workspaces, isLoading: isLoadingWorkspaces } = useWorkspaceContext();
  const [subscriptions, setSubscriptions] = useState<WorkspaceSubscription[] | null>(null);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    getAllWorkspaceSubscriptions()
      .then(setSubscriptions)
      .catch((err) => {
        console.error("[super-admin/billing] failed to load subscriptions:", err);
        setSubscriptions([]);
      });
  }, []);

  async function refreshSubscriptions() {
    setSubscriptions(await getAllWorkspaceSubscriptions());
  }

  async function handleSetStatus(workspaceId: string, status: Extract<SubscriptionStatus, "active" | "paused" | "canceled">) {
    setBusyWorkspaceId(workspaceId);
    try {
      const result = await setSubscriptionStatus(workspaceId, status);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't update this subscription.");
        return;
      }
      toast.success(`Subscription ${status === "active" ? "reactivated" : status}`);
      await refreshSubscriptions();
    } finally {
      setBusyWorkspaceId(null);
    }
  }

  async function handleActivatePlan(workspaceId: string, planId: Exclude<WorkspacePlan, "enterprise">) {
    setBusyWorkspaceId(workspaceId);
    try {
      const result = await activatePlanManually(workspaceId, planId);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't activate this plan.");
        return;
      }
      toast.success(`${PLAN_DISPLAY_NAMES[planId]} activated`);
      await refreshSubscriptions();
    } finally {
      setBusyWorkspaceId(null);
    }
  }

  const isLoading = isLoadingWorkspaces || subscriptions === null;
  const rows: Row[] = isLoading
    ? []
    : workspaces
        .map((workspace) => ({
          workspace,
          subscription: subscriptions!.find((s) => s.workspaceId === workspace.id) ?? null,
        }))
        .sort((a, b) => (b.workspace.createdAt > a.workspace.createdAt ? 1 : -1));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-foreground-muted">Every customer workspace&apos;s subscription, plan, and status.</p>
      </div>

      <SettingsSection title={`${rows.length || (isLoading ? "..." : 0)} workspace${rows.length === 1 ? "" : "s"}`}>
        {isLoading ? (
          <Loader label="Loading subscriptions..." />
        ) : rows.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-8 w-8" />} title="No workspaces yet" description="Nothing has been created on the platform yet." />
        ) : (
          <div className="flex flex-col gap-2 overflow-x-auto">
            {rows.map(({ workspace, subscription }) => {
              const plan = subscription?.planId ?? workspace.plan;
              const status = subscription?.status ?? (workspace.subscriptionStatus === "pending_payment" ? "incomplete" : "active");
              const isBusy = busyWorkspaceId === workspace.id;
              const isEnterprise = plan === "enterprise";

              return (
                <div key={workspace.id} className="flex flex-col gap-3 rounded-theme border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`${ROUTES.superAdminCustomers}/${workspace.id}`} className="truncate text-sm font-semibold text-foreground hover:underline">
                        {workspace.name}
                      </Link>
                      <Badge variant="info">{PLAN_DISPLAY_NAMES[plan] ?? plan}</Badge>
                      <Badge variant={status === "active" || status === "trialing" ? "success" : status === "past_due" ? "warning" : "default"}>
                        {SUBSCRIPTION_STATUS_LABEL[status as keyof typeof SUBSCRIPTION_STATUS_LABEL] ?? status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {subscription?.currentPeriodEnd ? `Renews ${formatDate(subscription.currentPeriodEnd)}` : "No renewal date set"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isEnterprise &&
                      CHOOSABLE_PLANS.filter((p) => p !== plan).map((p) => (
                        <Button key={p} size="sm" variant="outline" isLoading={isBusy} onClick={() => handleActivatePlan(workspace.id, p)}>
                          Activate {PLAN_DISPLAY_NAMES[p]}
                        </Button>
                      ))}
                    {status !== "paused" ? (
                      <Button size="sm" variant="outline" isLoading={isBusy} onClick={() => handleSetStatus(workspace.id, "paused")}>
                        <Pause className="mr-1 h-3.5 w-3.5" /> Suspend
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" isLoading={isBusy} onClick={() => handleSetStatus(workspace.id, "active")}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Reactivate
                      </Button>
                    )}
                    {status !== "canceled" && (
                      <Button size="sm" variant="danger" isLoading={isBusy} onClick={() => handleSetStatus(workspace.id, "canceled")}>
                        <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
