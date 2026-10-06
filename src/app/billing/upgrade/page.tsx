"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useChoosePlan } from "@/hooks/useChoosePlan";
import { useToast } from "@/hooks/useToast";
import { getWorkspaceSubscription } from "@/services/subscriptionService";
import { planHeadline, resolveBillingView, getPlanRequest, EFFECTIVE_STATUS_LABEL } from "@/lib/billingDisplay";
import { useBillingCacheResync } from "@/hooks/useBillingCacheResync";
import { PLAN_ORDER, PLAN_DISPLAY_NAMES, PLAN_PRICING, PLAN_LIMITS } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
import { WorkspaceSubscription } from "@/types/billing.types";
import { WorkspacePlan } from "@/types/workspace.types";

const CHOOSABLE_PLANS = PLAN_ORDER.filter((p) => p !== "enterprise") as Exclude<WorkspacePlan, "enterprise">[];

/**
 * Dedicated customer-facing upgrade flow — see TrialBanner.tsx and
 * Settings > Billing & Plan's "Upgrade" buttons, both of which route
 * here instead of making a customer navigate the full workspace
 * settings/editing shell just to pick a plan. This page is a UI only:
 * every authoritative decision (who can act on this workspace, what a
 * plan actually costs, whether a subscription becomes active) is
 * re-verified server-side by the SAME /api/billing/checkout and
 * /api/billing/change-plan routes Settings > Billing & Plan already
 * uses (via the shared useChoosePlan hook) — this page never writes
 * billing state itself and never activates anything on its own.
 *
 * Deliberately NOT under the (dashboard) route group: no sidebar, no
 * member/project/workspace-settings controls, nothing to navigate
 * away into by accident. ProtectedRoute alone supplies the auth gate.
 */
function UpgradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPlan = searchParams.get("plan");
  const toast = useToast();

  const { workspace, workspaceId, isLoading: isLoadingWorkspace } = useWorkspaceContext();
  const { canManageWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null | undefined>(undefined);

  useEffect(() => {
    if (!workspaceId) return;
    getWorkspaceSubscription(workspaceId)
      .then(setSubscription)
      .catch((err) => {
        console.error("[billing/upgrade] failed to load subscription:", err);
        setSubscription(null);
      });
  }, [workspaceId]);

  useBillingCacheResync(workspace, subscription);

  const { isChoosing, choosePlan } = useChoosePlan(workspaceId, subscription, async () => {
    if (workspaceId) setSubscription(await getWorkspaceSubscription(workspaceId));
  });

  async function handleChoose(planId: Exclude<WorkspacePlan, "enterprise">) {
    const result = await choosePlan(planId);
    if (!result.ok) {
      if (result.violations?.length) {
        toast.error(result.violations.join(" "));
      } else {
        toast.error(result.error ?? "Couldn't start checkout for this plan.");
      }
      return;
    }
    toast.success(result.message ?? "Plan change recorded.");
  }

  if (isLoadingWorkspace || isLoadingRole || !workspace || subscription === undefined) {
    return <Loader fullScreen label="Loading..." />;
  }

  if (!canManageWorkspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Only workspace owners and admins can change the plan.</h1>
        <Link href={ROUTES.dashboard} className="text-sm font-medium text-primary hover:underline">
          Back to workspace
        </Link>
      </div>
    );
  }

  const view = resolveBillingView(workspace, subscription);
  const effectivePlan = view.plan;
  const trialExpired = view.trialExpired;
  const isTrialing = view.isTrialing;
  const trialDaysLeft = view.trialDaysLeft;
  const status = view.status;
  const request = getPlanRequest(workspace, subscription);
  const hasLivePlan = view.isTrialing || view.status === "active";

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div>
          <Link href={ROUTES.dashboard} className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to workspace
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">Upgrade your plan</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {isTrialing
              ? `Keep your ${PLAN_DISPLAY_NAMES[subscription?.planId ?? "pro"]} features after your trial ends.`
              : trialExpired
                ? "Your trial expired — choose a plan to continue."
                : request && !request.checkoutStarted
                  ? `Payment required to activate ${PLAN_DISPLAY_NAMES[request.planId]}.`
                  : "Choose the plan that fits your team."}
          </p>
        </div>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Your current plan</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-foreground">{planHeadline(effectivePlan, isTrialing)}</span>
            <Badge variant={trialExpired || status === "pending_payment" || status === "past_due" ? "warning" : status === "active" || status === "trialing" ? "success" : "default"}>
              {EFFECTIVE_STATUS_LABEL[status]}
            </Badge>
          </div>
          {trialDaysLeft !== null && (
            <p className="mt-1 text-xs text-primary">
              {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining
            </p>
          )}
          {request && (
            <p className="mt-1 text-xs text-warning">
              {request.checkoutStarted
                ? `${PLAN_DISPLAY_NAMES[request.planId]} checkout started — activates once payment is confirmed.${hasLivePlan ? " Your current plan is unaffected until then." : ""}`
                : `${PLAN_DISPLAY_NAMES[request.planId]} requested — payment required. Continue to Payment below to start checkout.`}
            </p>
          )}
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Choose a plan to continue</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CHOOSABLE_PLANS.map((planId) => {
              const pricing = PLAN_PRICING[planId];
              const limits = PLAN_LIMITS[planId];
              const isCurrent = effectivePlan === planId && hasLivePlan;
              const isUpgrade = PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(effectivePlan);
              const isHighlighted = !isCurrent && (preselectedPlan === planId || (request?.planId === planId && !request.checkoutStarted));
              // Checkout already started for this plan: no button, so a second
              // click can't look like (or become) a second purchase request.
              const isRequested = request?.planId === planId && request.checkoutStarted;

              return (
                <Card
                  key={planId}
                  className={isCurrent ? "border-primary bg-primary/5" : isHighlighted ? "border-primary" : undefined}
                >
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{PLAN_DISPLAY_NAMES[planId]}</p>
                      <p className="mt-0.5 text-xl font-semibold text-foreground">
                        {pricing.monthlyUsd !== null ? `$${pricing.monthlyUsd}` : "Custom"}
                        <span className="text-xs font-normal text-foreground-muted"> /{pricing.billingPeriod === "forever" ? "forever" : "mo"}</span>
                      </p>
                    </div>
                    <ul className="flex flex-col gap-1 text-xs text-foreground-muted">
                      <li>{Number.isFinite(limits.maxMembers) ? `${limits.maxMembers} members` : "Unlimited members"}</li>
                      <li>{Number.isFinite(limits.maxProjects) ? `${limits.maxProjects} active projects` : "Unlimited projects"}</li>
                      <li>
                        {Number.isFinite(limits.maxStorageBytes)
                          ? `${(limits.maxStorageBytes / (1024 * 1024 * 1024)).toFixed(0)} GB storage`
                          : "Unlimited storage"}
                      </li>
                      <li>
                        {Number.isFinite(limits.maxAIRequestsPerMonth)
                          ? `${limits.maxAIRequestsPerMonth} AI generations/mo`
                          : "Unlimited AI generations"}
                      </li>
                    </ul>
                    {isCurrent ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                        <Check className="h-3.5 w-3.5" /> Current plan
                      </span>
                    ) : isRequested ? (
                      <span className="text-xs font-medium text-warning">Checkout started — awaiting payment</span>
                    ) : (
                      <Button size="sm" variant={isUpgrade ? "primary" : "outline"} isLoading={isChoosing === planId} onClick={() => handleChoose(planId)}>
                        {planId === "starter" ? "Select Free" : isUpgrade ? "Continue to Payment" : `Switch to ${PLAN_DISPLAY_NAMES[planId]}`}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Need Enterprise?</p>
            <p className="text-xs text-foreground-muted">Custom limits and terms for larger teams.</p>
          </div>
          <Link href="/pricing#contact-sales">
            <Button size="sm" variant="outline">
              Contact Sales
            </Button>
          </Link>
        </Card>

        <button
          type="button"
          onClick={() => router.push(ROUTES.dashboard)}
          className="self-center text-sm text-foreground-muted hover:text-foreground"
        >
          Cancel and go back
        </button>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<Loader fullScreen label="Loading..." />}>
        <UpgradePageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
