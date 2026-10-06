"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDocs, query, where } from "firebase/firestore";
import { CreditCard, Pause, Play, XCircle, Receipt } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getAllWorkspaceSubscriptions } from "@/services/subscriptionService";
import { setSubscriptionStatus, activatePlanManually } from "@/services/billingService";
import { membersCol } from "@/lib/firebase/firestore";
import { planHeadline, resolveBillingView, getPlanRequest, billingCacheIsStale, BILLING_TYPE_LABEL, EFFECTIVE_STATUS_LABEL } from "@/lib/billingDisplay";
import { requestBillingResync } from "@/hooks/useBillingCacheResync";
import { PLAN_DISPLAY_NAMES, PLAN_ORDER, PLAN_PRICING } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils/date";
import type { WorkspaceSubscription, SubscriptionStatus } from "@/types/billing.types";
import type { Workspace, WorkspacePlan } from "@/types/workspace.types";

const CHOOSABLE_PLANS = PLAN_ORDER.filter((p) => p !== "enterprise") as Exclude<WorkspacePlan, "enterprise">[];

const CHECKOUT_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  created: "Checkout Started",
  redirected: "Redirected to payment",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  not_started: "Payment Not Yet Confirmed",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

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
  const [ownerByWorkspaceId, setOwnerByWorkspaceId] = useState<Record<string, { displayName: string; email: string }>>({});
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    getAllWorkspaceSubscriptions()
      .then(setSubscriptions)
      .catch((err) => {
        console.error("[super-admin/billing] failed to load subscriptions:", err);
        setSubscriptions([]);
      });
    // One-time, all-workspaces owner lookup for the Purchase Requests
    // table's "Customer" column — `members` is readable by any signed-in
    // user (see firestore.rules), so this is a single cheap query, not
    // a second billing data model.
    getDocs(query(membersCol(), where("role", "==", "owner")))
      .then((snapshot) => {
        const map: Record<string, { displayName: string; email: string }> = {};
        snapshot.docs.forEach((d) => {
          const m = d.data();
          map[m.workspaceId] = { displayName: m.displayName, email: m.email };
        });
        setOwnerByWorkspaceId(map);
      })
      .catch((err) => console.error("[super-admin/billing] failed to load workspace owners:", err));
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

  // A "purchase request" is a subscription doc that's either sitting
  // at status "incomplete" (no live entitlement — brand new/lapsed,
  // nothing to protect) OR carries a `requestedPlanId` (a live
  // entitlement — active or still-trialing — with a different plan
  // requested on top of it, left untouched so it keeps applying; see
  // /api/billing/change-plan's doc comment). Both are states
  // /api/billing/checkout and /api/billing/change-plan record and
  // never advance past on their own (see billingAdmin.ts) — this is
  // the real checkout/change-plan activity, not a second data model
  // invented for this view.
  const purchaseRequests = rows.filter((r) => r.subscription?.status === "incomplete" || r.subscription?.requestedPlanId);

  // Each workspace lands in exactly one bucket, from its subscription
  // via resolveBillingView: a trial is never counted as paid; only a
  // verified payment (`paymentStatus: "paid"`) is Paid; only an
  // explicit manual activation (`activationSource: "manual"`) is
  // Complimentary / Manual; an active record with neither is Legacy /
  // payment status unknown — counted on its own, never as Paid and
  // never assumed complimentary. An expired trial or pending payment
  // is "Free / other" (Free entitlements).
  const views = rows.map((r) => resolveBillingView(r.workspace, r.subscription));
  const paidCount = views.filter((v) => v.billingType === "paid").length;
  const manualCount = views.filter((v) => v.billingType === "manual_comp" || v.billingType === "enterprise").length;
  const legacyCount = views.filter((v) => v.billingType === "legacy_unknown").length;
  const trialingCount = views.filter((v) => v.isTrialing).length;
  const freeCount = rows.length - paidCount - manualCount - legacyCount - trialingCount;

  // Repair any stale workspace billing display cache server-side
  // (e.g. an expired trial still cached as "trialing") so every
  // cache-reading surface converges — see useBillingCacheResync.ts.
  useEffect(() => {
    if (!subscriptions) return;
    workspaces.forEach((workspace) => {
      const sub = subscriptions.find((s) => s.workspaceId === workspace.id) ?? null;
      if (billingCacheIsStale(workspace, sub)) void requestBillingResync(workspace.id);
    });
  }, [subscriptions, workspaces]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-foreground-muted">Every customer workspace&apos;s subscription, plan, and status.</p>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-theme border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Active paid</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{paidCount}</p>
          </div>
          <div className="rounded-theme border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Complimentary / manual</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{manualCount}</p>
          </div>
          <div className="rounded-theme border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Legacy / payment unknown</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{legacyCount}</p>
          </div>
          <div className="rounded-theme border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Pro trials</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{trialingCount}</p>
          </div>
          <div className="rounded-theme border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Free / other</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{freeCount}</p>
          </div>
        </div>
      )}

      <SettingsSection title={`Purchase requests${purchaseRequests.length ? ` (${purchaseRequests.length})` : ""}`} description="Checkout and plan-change requests awaiting payment confirmation.">
        {isLoading ? (
          <Loader label="Loading..." />
        ) : purchaseRequests.length === 0 ? (
          <EmptyState icon={<Receipt className="h-8 w-8" />} title="No pending requests" description="No workspace is currently waiting on a payment confirmation." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-foreground-muted">
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Workspace</th>
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Checkout status</th>
                  <th className="py-2 pr-4 font-medium">Payment status</th>
                  <th className="py-2 pr-4 font-medium">Created</th>
                  <th className="py-2 pr-4 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {purchaseRequests.map(({ workspace, subscription }) => {
                  const owner = ownerByWorkspaceId[workspace.id];
                  const requestedPlanId = subscription!.requestedPlanId ?? subscription!.planId;
                  const pricing = PLAN_PRICING[requestedPlanId];
                  const amount = pricing.monthlyUsd !== null ? `$${pricing.monthlyUsd}/${pricing.billingPeriod === "forever" ? "forever" : "mo"}` : "Custom";
                  const hasLiveEntitlement = !!subscription!.requestedPlanId;
                  return (
                    <tr key={workspace.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4">
                        <p className="font-medium text-foreground">{owner?.displayName ?? "Unknown"}</p>
                        <p className="text-xs text-foreground-muted">{owner?.email ?? ""}</p>
                      </td>
                      <td className="py-2 pr-4">
                        <Link href={`${ROUTES.superAdminCustomers}/${workspace.id}`} className="text-foreground hover:underline">
                          {workspace.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {hasLiveEntitlement ? `${PLAN_DISPLAY_NAMES[subscription!.planId]} → ${PLAN_DISPLAY_NAMES[requestedPlanId]}` : PLAN_DISPLAY_NAMES[requestedPlanId]}
                      </td>
                      <td className="py-2 pr-4">{amount}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="info">{CHECKOUT_STATUS_LABEL[subscription!.checkoutStatus] ?? "Requested"}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="warning">
                          {subscription!.paymentStatus === "not_started" && subscription!.billingProvider === "manual"
                            ? "Not yet confirmed — no provider connected"
                            : (PAYMENT_STATUS_LABEL[subscription!.paymentStatus] ?? "Pending")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-foreground-muted">{formatDate(subscription!.createdAt)}</td>
                      <td className="py-2 pr-4 text-xs text-foreground-muted">{formatDate(subscription!.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={`${rows.length || (isLoading ? "..." : 0)} workspace${rows.length === 1 ? "" : "s"}`}>
        {isLoading ? (
          <Loader label="Loading subscriptions..." />
        ) : rows.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-8 w-8" />} title="No workspaces yet" description="Nothing has been created on the platform yet." />
        ) : (
          <div className="flex flex-col gap-2 overflow-x-auto">
            {rows.map(({ workspace, subscription }) => {
              // Effective ENTITLEMENT plan (Free while pending/expired), not
              // the requested `planId` — a pending Pro request must read as
              // "Free · Pro requested", never "Pro".
              const view = resolveBillingView(workspace, subscription);
              const plan = view.plan;
              const status = view.status;
              const isBusy = busyWorkspaceId === workspace.id;
              const isEnterprise = plan === "enterprise";
              const isTrialing = view.isTrialing;
              const trialDaysLeft = view.trialDaysLeft;
              const request = getPlanRequest(workspace, subscription);

              return (
                <div key={workspace.id} className="flex flex-col gap-3 rounded-theme border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`${ROUTES.superAdminCustomers}/${workspace.id}`} className="truncate text-sm font-semibold text-foreground hover:underline">
                        {workspace.name}
                      </Link>
                      <Badge variant="info">{planHeadline(plan, isTrialing)}</Badge>
                      <Badge variant={status === "active" || status === "trialing" ? "success" : status === "past_due" || status === "pending_payment" || status === "expired" ? "warning" : "default"}>
                        {EFFECTIVE_STATUS_LABEL[status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">
                      Billing: {view.billingType ? BILLING_TYPE_LABEL[view.billingType] : "Free"}
                      {isTrialing && trialDaysLeft !== null ? ` · Trial remaining: ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} · Payment: Not paid` : ""}
                      {view.billingType === "paid" ? " · Payment: Paid" : ""}
                      {view.billingType === "manual_comp" ? " · Payment: None recorded" : ""}
                      {view.billingType === "legacy_unknown" ? " · Payment: Unknown (activated before payment tracking)" : ""}
                      {!isTrialing && subscription?.currentPeriodEnd ? ` · Renews ${formatDate(subscription.currentPeriodEnd)}` : ""}
                      {request
                        ? request.checkoutStarted
                          ? ` · ${PLAN_DISPLAY_NAMES[request.planId]} checkout started`
                          : ` · ${PLAN_DISPLAY_NAMES[request.planId]} requested — payment not started`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isEnterprise &&
                      CHOOSABLE_PLANS.filter((p) => !(status === "active" && p === plan)).map((p) => (
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
