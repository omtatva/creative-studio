"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuthContext } from "@/contexts/AuthContext";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { getSalesLeads } from "@/services/salesLeadService";
import { ROUTES } from "@/lib/constants/routes";
import { timeAgo } from "@/lib/utils/date";
import { SalesLead, SalesLeadStatus } from "@/types/billing.types";

const STATUS_VARIANT: Record<SalesLeadStatus, "default" | "info" | "warning" | "success" | "danger"> = {
  new: "info",
  contacted: "default",
  qualified: "warning",
  proposal: "warning",
  won: "success",
  lost: "danger",
};

/** Super Admin > Sales — Enterprise leads (Section 16), Super-Admin-only, same check as every other cross-workspace admin view in this app. */
export default function SuperAdminSalesPage() {
  const { profile } = useAuthContext();
  const isSuperAdmin = isSuperAdminUser(profile);
  const [leads, setLeads] = useState<SalesLead[] | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    getSalesLeads()
      .then(setLeads)
      .catch((err) => {
        console.error("[super-admin/sales] failed to load leads:", err);
        setLeads([]);
      });
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Sales</h1>
        <p className="text-sm text-foreground-muted">Only the platform Super Admin can view this page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sales</h1>
        <p className="mt-1 text-sm text-foreground-muted">Enterprise &quot;Contact Sales&quot; submissions.</p>
      </div>

      <SettingsSection title={`${leads?.length ?? "..."} lead${leads?.length === 1 ? "" : "s"}`}>
        {!leads ? (
          <Loader label="Loading leads..." />
        ) : leads.length === 0 ? (
          <EmptyState icon={<Handshake className="h-8 w-8" />} title="No leads yet" description="Enterprise inquiries submitted from the pricing page will show up here." />
        ) : (
          <div className="flex flex-col gap-2">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={`${ROUTES.superAdminSales}/${lead.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-theme border border-border bg-surface p-3 hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{lead.companyName}</p>
                  <p className="truncate text-xs text-foreground-muted">
                    {lead.name} · {lead.email} {lead.teamSize ? `· ${lead.teamSize}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-foreground-muted">{timeAgo(lead.createdAt)}</span>
                  <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status.toUpperCase()}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
