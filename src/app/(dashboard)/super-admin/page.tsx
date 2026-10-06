"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Users, Handshake, CreditCard } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getSalesLeads } from "@/services/salesLeadService";
import { useAllWorkspaceSubscriptions } from "@/hooks/useBillingCacheResync";
import { planHeadline, resolveBillingView } from "@/lib/billingDisplay";
import { ROUTES } from "@/lib/constants/routes";
import type { SalesLead } from "@/types/billing.types";

/** Super Admin > Dashboard — a quick platform-wide snapshot; every number links to the page that lets you act on it. */
export default function SuperAdminDashboardPage() {
  const { workspaces, isLoading: isLoadingWorkspaces } = useWorkspaceContext();
  const [leads, setLeads] = useState<SalesLead[] | null>(null);

  useEffect(() => {
    getSalesLeads()
      .then(setLeads)
      .catch(() => setLeads([]));
  }, []);

  // Buckets come from each workspace's SUBSCRIPTION (authoritative,
  // live-computed expiry) via resolveBillingView — never the plan
  // cache alone, which a client could once forge and which goes stale
  // when a trial ends. A live trial, an expired trial, a pending
  // payment, a paid plan and a complimentary/manual plan are all
  // counted separately, so a trial is never counted as a paid Pro.
  // useAllWorkspaceSubscriptions also asks the server to repair any
  // stale cache it finds.
  const { byWorkspaceId: subscriptions, isLoading: isLoadingSubscriptions } = useAllWorkspaceSubscriptions(workspaces);
  const buckets = workspaces.reduce<Record<string, { label: string; count: number }>>((acc, w) => {
    const sub = subscriptions ? (subscriptions[w.id] ?? null) : undefined;
    const view = resolveBillingView(w, sub);
    let key: string;
    let label: string;
    if (view.trialExpired) {
      key = "expired";
      label = "Trial Expired";
    } else if (view.status === "pending_payment") {
      key = "pending";
      label = "Pending payment";
    } else if (view.isTrialing) {
      key = `${view.plan}:trial`;
      label = planHeadline(view.plan, true);
    } else if (view.plan !== "starter" && view.billingType === "paid") {
      key = `${view.plan}:paid`;
      label = `${planHeadline(view.plan, false)} · Paid`;
    } else if (view.plan !== "starter" && view.billingType === "manual_comp") {
      key = `${view.plan}:comp`;
      label = `${planHeadline(view.plan, false)} · Complimentary`;
    } else if (view.plan !== "starter" && view.billingType === "legacy_unknown") {
      key = `${view.plan}:legacy`;
      label = `${planHeadline(view.plan, false)} · Legacy (payment unknown)`;
    } else {
      key = view.plan;
      label = planHeadline(view.plan, false);
    }
    acc[key] = { label, count: (acc[key]?.count ?? 0) + 1 };
    return acc;
  }, {});
  const newLeads = leads?.filter((l) => l.status === "new").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Super Admin</h1>
        <p className="mt-1 text-sm text-foreground-muted">Platform-wide overview, across every customer workspace.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Building2 className="h-4.5 w-4.5" />}
          label="Workspaces"
          value={isLoadingWorkspaces ? "…" : workspaces.length}
          href={ROUTES.superAdminCustomers}
        />
        <StatCard
          icon={<Handshake className="h-4.5 w-4.5" />}
          label="New sales leads"
          value={leads === null ? "…" : newLeads}
          href={ROUTES.superAdminSales}
        />
        <StatCard
          icon={<CreditCard className="h-4.5 w-4.5" />}
          label="Total leads"
          value={leads === null ? "…" : leads.length}
          href={ROUTES.superAdminSales}
        />
      </div>

      <SettingsSection title="Workspaces by plan">
        {isLoadingWorkspaces || isLoadingSubscriptions ? (
          <Loader label="Loading..." />
        ) : workspaces.length === 0 ? (
          <p className="text-sm text-foreground-muted">No workspaces on the platform yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(buckets).map(([key, bucket]) => (
              <div key={key} className="flex min-w-[120px] flex-col gap-1 rounded-theme border border-border bg-surface p-3">
                <p className="text-xs text-foreground-muted">{bucket.label}</p>
                <p className="text-lg font-semibold text-foreground">{bucket.count}</p>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Quick links">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickLink icon={<Users className="h-4 w-4" />} href={ROUTES.superAdminUsers} label="Users" description="Every account on the platform" />
          <QuickLink icon={<CreditCard className="h-4 w-4" />} href={ROUTES.superAdminBilling} label="Billing" description="Every workspace's subscription" />
        </div>
      </SettingsSection>
    </div>
  );
}

function StatCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-theme border border-border bg-cards p-4 shadow-soft transition-colors hover:bg-surface-muted">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme bg-primary/10 text-primary">{icon}</span>
      <div>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="text-xs text-foreground-muted">{label}</p>
      </div>
    </Link>
  );
}

function QuickLink({ icon, href, label, description }: { icon: React.ReactNode; href: string; label: string; description: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-theme border border-border bg-surface p-3 hover:bg-surface-muted">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-theme bg-primary/10 text-primary">{icon}</span>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-foreground-muted">{description}</p>
      </div>
    </Link>
  );
}
