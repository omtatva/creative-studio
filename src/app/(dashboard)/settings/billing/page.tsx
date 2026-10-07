"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { PlanUsageSection } from "@/components/settings/PlanUsageSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useChoosePlan } from "@/hooks/useChoosePlan";
import { useToast } from "@/hooks/useToast";
import { getWorkspaceSubscription } from "@/services/subscriptionService";
import { planHeadline, resolveBillingView, getPlanRequest, EFFECTIVE_STATUS_LABEL } from "@/lib/billingDisplay";
import { useBillingCacheResync } from "@/hooks/useBillingCacheResync";
import { PLAN_ORDER, PLAN_DISPLAY_NAMES, PLAN_PRICING } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
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
 *
 * Plan selection itself is NOT handled here for an upgrade — the
 * "Upgrade" button below routes to the dedicated /billing/upgrade
 * flow instead, so there's one canonical customer-facing place that
 * actually initiates a paid-plan request (see TrialBanner.tsx, which
 * routes there too). A same-or-lower "Switch" still acts inline here
 * via the shared useChoosePlan hook, same server routes as before.
 */
export default function BillingPlanSettingsPage() {
  const router = useRouter();
  const { workspace, isLoading: isLoadingWorkspace } = useWorkspaceContext();
  const { canManageWorkspace, canAdministerWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  // A platform Super Admin may VIEW any workspace's billing here, but plan/limits/subscription are
  // changed through Super Admin > Customers/Billing (authoritative), never by filing a customer-side request.
  const isSuperAdminView = canAdministerWorkspace && !canManageWorkspace;
  const toast = useToast();
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null | undefined>(undefined);

  useEffect(() => {
    if (!workspace) return;
    getWorkspaceSubscription(workspace.id)
      .then(setSubscription)
      .catch((err) => {
        console.error("[settings/billing] failed to load subscription:", err);
        setSubscription(null);
      });
  }, [workspace]);

  useBillingCacheResync(workspace, subscription);

  const { isChoosing, choosePlan } = useChoosePlan(workspace?.id ?? null, subscription, async () => {
    if (workspace) setSubscription(await getWorkspaceSubscription(workspace.id));
  });

  async function handleSwitchPlan(planId: Exclude<WorkspacePlan, "enterprise">) {
    const result = await choosePlan(planId);
    if (!result.ok) {
      if (result.violations?.length) {
        toast.error(result.violations.join(" "));
      } else {
        toast.error(result.error ?? "Couldn't change your plan.");
      }
      return;
    }
    toast.success(result.message ?? "Plan change recorded.");
  }

  if (isLoadingWorkspace || isLoadingRole || !workspace) return <Loader label="Loading billing..." />;

  if (!canAdministerWorkspace) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Billing & Plan</h1>
        <p className="text-sm text-foreground-muted">Only workspace owners and admins can view billing.</p>
      </div>
    );
  }

  // Computed LIVE from the subscription doc (see resolveBillingView)
  // rather than trusted from the workspace cache, which only re-syncs
  // on the next subscription write — so an expired trial reads as
  // expired here immediately, and useBillingCacheResync (above) asks
  // the server to repair the cache for everything else.
  const view = resolveBillingView(workspace, subscription);
  const effectivePlan = view.plan;
  const trialExpired = view.trialExpired;
  const isTrialing = view.isTrialing;
  const trialDaysLeft = view.trialDaysLeft;
  const status = view.status;
  const request = getPlanRequest(workspace, subscription);
  const hasLivePlan = view.isTrialing || view.status === "active";

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
              <span className="text-lg font-semibold text-foreground">{planHeadline(effectivePlan, isTrialing)}</span>
              <Badge variant={trialExpired || status === "pending_payment" || status === "past_due" ? "warning" : status === "active" || status === "trialing" ? "success" : "default"}>
                {EFFECTIVE_STATUS_LABEL[status]}
              </Badge>
            </div>
            {trialDaysLeft !== null && (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <Clock className="h-3.5 w-3.5" />
                {PLAN_DISPLAY_NAMES[subscription?.planId ?? "pro"]} trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining
              </p>
            )}
            {trialExpired && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <Clock className="h-3.5 w-3.5" />
                Your trial expired — you&apos;re on {PLAN_DISPLAY_NAMES.starter} limits until you upgrade.
              </p>
            )}
            {subscription?.currentPeriodEnd && (
              <p className="text-xs text-foreground-muted">
                {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDate(subscription.currentPeriodEnd)}
              </p>
            )}
            {request && (
              <p className="text-xs text-warning">
                {request.checkoutStarted
                  ? `${PLAN_DISPLAY_NAMES[request.planId]} checkout started — activates once payment is confirmed.${hasLivePlan ? " Your current plan is unaffected until then." : ""}`
                  : `${PLAN_DISPLAY_NAMES[request.planId]} requested — payment required.`}
              </p>
            )}
          </div>
          {isSuperAdminView ? null : request && !request.checkoutStarted ? (
            <Button size="sm" onClick={() => router.push(`${ROUTES.billingUpgrade}?plan=${request.planId}`)}>
              Continue to Payment
            </Button>
          ) : trialExpired ? (
            <Button size="sm" onClick={() => router.push(ROUTES.billingUpgrade)}>
              Upgrade Plan
            </Button>
          ) : null}
        </div>
      </SettingsSection>

      <PlanUsageSection workspace={workspace} subscription={subscription} />

      {isSuperAdminView && (
        <SettingsSection title="Plan, limits & subscription" description="Authoritative billing is managed by the platform, not from the customer's Billing page.">
          <p className="text-sm text-foreground-muted">
            You are viewing this workspace as Super Admin.{" "}
            <Link href={`${ROUTES.superAdminCustomers}/${workspace.id}`} className="font-medium text-primary hover:underline">
              Manage its plan, limits, entitlements and subscription in Super Admin → Customers
            </Link>
            .
          </p>
        </SettingsSection>
      )}

      {!isSuperAdminView && (
      <SettingsSection title="Change plan" description="Choose a plan — it activates once payment is confirmed, never immediately.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CHOOSABLE_PLANS.map((planId) => {
            const pricing = PLAN_PRICING[planId];
            const isCurrent = effectivePlan === planId && hasLivePlan;
            const isUpgrade = PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(effectivePlan);
            const isRequested = request?.planId === planId && request.checkoutStarted;
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
                ) : isRequested ? (
                  <span className="text-xs font-medium text-warning">Checkout started — awaiting payment</span>
                ) : isUpgrade ? (
                  <Button size="sm" variant="outline" onClick={() => router.push(`${ROUTES.billingUpgrade}?plan=${planId}`)}>
                    {request?.planId === planId ? "Continue to Payment" : "Upgrade"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleSwitchPlan(planId)} isLoading={isChoosing === planId}>
                    Switch
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
      )}
    </div>
  );
}
