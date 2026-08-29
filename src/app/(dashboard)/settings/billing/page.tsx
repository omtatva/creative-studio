"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { PlanUsageSection } from "@/components/settings/PlanUsageSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useToast } from "@/hooks/useToast";
import { getWorkspaceSubscription } from "@/services/subscriptionService";
import { createCheckoutSession, changePlan } from "@/services/billingService";
import { SUBSCRIPTION_STATUS_LABEL, resolveEntitlements, isTrialExpired } from "@/lib/entitlements";
import { PLAN_ORDER, PLAN_DISPLAY_NAMES, PLAN_PRICING } from "@/lib/constants/planLimits";
import { formatDate } from "@/lib/utils/date";
import { WorkspaceSubscription } from "@/types/billing.types";
import { WorkspacePlan } from "@/types/workspace.types";

const CHOOSABLE_PLANS = PLAN_ORDER.filter((p) => p !== "enterprise") as Exclude<WorkspacePlan, "enterprise">[];

/**
 * Settings > Billing & Plan — owner/admin only (Section 11). Shows the
 * subscription record's own trusted fields (never a client guess),
 * reuses the existing PlanUsageSection for the usage bars, and lets an
 * owner request a plan change through billingService — which never
 * activates anything itself, only records the request (see
 * /api/billing/checkout's doc comment for what happens once a real
 * payment provider is connected).
 */
export default function BillingPlanSettingsPage() {
  const { workspace, isLoading: isLoadingWorkspace } = useWorkspaceContext();
  const { canManageWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  const toast = useToast();
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null | undefined>(undefined);
  const [isChoosing, setIsChoosing] = useState<WorkspacePlan | null>(null);

  useEffect(() => {
    if (!workspace) return;
    getWorkspaceSubscription(workspace.id)
      .then(setSubscription)
      .catch((err) => {
        console.error("[settings/billing] failed to load subscription:", err);
        setSubscription(null);
      });
  }, [workspace]);

  async function handleChoosePlan(planId: Exclude<WorkspacePlan, "enterprise">) {
    if (!workspace) return;
    setIsChoosing(planId);
    try {
      const hasActiveSubscription = subscription && (subscription.status === "active" || subscription.status === "trialing");
      const result = hasActiveSubscription ? await changePlan(workspace.id, planId) : await createCheckoutSession(workspace.id, planId);
      if (!result.ok) {
        if (result.violations?.length) {
          toast.error(result.violations.join(" "));
        } else {
          toast.error(result.error ?? "Couldn't change your plan.");
        }
        return;
      }
      toast.success(result.data?.message ?? "Plan change recorded.");
      const refreshed = await getWorkspaceSubscription(workspace.id);
      setSubscription(refreshed);
    } finally {
      setIsChoosing(null);
    }
  }

  if (isLoadingWorkspace || isLoadingRole || !workspace) return <Loader label="Loading billing..." />;

  if (!canManageWorkspace) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Billing & Plan</h1>
        <p className="text-sm text-foreground-muted">Only workspace owners and admins can view billing.</p>
      </div>
    );
  }

  // Computed LIVE from the subscription doc rather than trusted from
  // workspace.plan/.subscriptionStatus — those are a cache that only
  // re-syncs on the next real subscription event, so right after a
  // trial's trialEnd passes they'd still show the stale trial plan
  // until something else changes the subscription. See
  // resolveEntitlements/isTrialExpired's doc comments.
  const trialExpired = isTrialExpired(subscription ?? null);
  const { plan: effectivePlan } = resolveEntitlements(subscription ?? null);
  const status = subscription?.status ?? (workspace.subscriptionStatus === "pending_payment" ? "incomplete" : "active");
  const isTrialing = subscription?.status === "trialing" && subscription.trialEnd && !trialExpired;
  const trialDaysLeft = isTrialing ? Math.max(0, Math.ceil((new Date(subscription!.trialEnd!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Billing & Plan</h1>
        <p className="mt-1 text-sm text-foreground-muted">Your plan, subscription status, and usage.</p>
      </div>

      <SettingsSection title="Your plan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-foreground">{PLAN_DISPLAY_NAMES[effectivePlan]}</span>
              <Badge variant={trialExpired ? "warning" : status === "active" || status === "trialing" ? "success" : status === "past_due" ? "warning" : "default"}>
                {trialExpired ? "Trial ended" : (SUBSCRIPTION_STATUS_LABEL[status as keyof typeof SUBSCRIPTION_STATUS_LABEL] ?? "Pending")}
              </Badge>
            </div>
            {trialDaysLeft !== null && (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <Clock className="h-3.5 w-3.5" />
                {PLAN_DISPLAY_NAMES[subscription!.planId]} trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining
              </p>
            )}
            {trialExpired && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <Clock className="h-3.5 w-3.5" />
                Your {PLAN_DISPLAY_NAMES[subscription!.planId]} trial ended — you&apos;re back on {PLAN_DISPLAY_NAMES.starter} limits until you upgrade.
              </p>
            )}
            {subscription?.currentPeriodEnd && (
              <p className="text-xs text-foreground-muted">
                {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDate(subscription.currentPeriodEnd)}
              </p>
            )}
            {workspace.subscriptionStatus === "pending_payment" && workspace.pendingPlan && (
              <p className="text-xs text-warning">
                {PLAN_DISPLAY_NAMES[workspace.pendingPlan]} requested — activates once payment is confirmed.
              </p>
            )}
          </div>
        </div>
      </SettingsSection>

      <PlanUsageSection workspace={workspace} />

      <SettingsSection title="Change plan" description="Choose a plan — it activates once payment is confirmed, never immediately.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CHOOSABLE_PLANS.map((planId) => {
            const pricing = PLAN_PRICING[planId];
            const isCurrent = effectivePlan === planId && (status === "active" || (status === "trialing" && !trialExpired));
            return (
              <div key={planId} className={`flex flex-col gap-3 rounded-theme border p-4 ${isCurrent ? "border-primary bg-primary/5" : "border-border bg-surface"}`}>
                <div>
                  <p className="text-sm font-semibold text-foreground">{PLAN_DISPLAY_NAMES[planId]}</p>
                  <p className="text-xs text-foreground-muted">
                    {pricing.monthlyUsd !== null ? `$${pricing.monthlyUsd}/${pricing.billingPeriod === "forever" ? "forever" : "mo"}` : "Custom"}
                  </p>
                </div>
                {isCurrent ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Check className="h-3.5 w-3.5" /> Current plan
                  </span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleChoosePlan(planId)} isLoading={isChoosing === planId}>
                    {PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(effectivePlan) ? "Upgrade" : "Switch"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-foreground-muted">
          Need Enterprise?{" "}
          <Link href="/pricing#contact-sales" className="font-medium text-primary hover:underline">
            Contact Sales
          </Link>
          .
        </p>
      </SettingsSection>
    </div>
  );
}
