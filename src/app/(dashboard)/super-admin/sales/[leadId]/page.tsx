"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { getSalesLead, updateSalesLeadStatus } from "@/services/salesLeadService";
import { activateEnterpriseSubscription } from "@/services/billingService";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils/date";
import { SalesLead, SalesLeadStatus } from "@/types/billing.types";

const STATUS_FLOW: { key: SalesLeadStatus; label: string }[] = [
  { key: "contacted", label: "Mark Contacted" },
  { key: "qualified", label: "Mark Qualified" },
  { key: "proposal", label: "Mark Proposal" },
  { key: "won", label: "Mark Won" },
  { key: "lost", label: "Mark Lost" },
];

const DETAIL_ROWS: { key: keyof SalesLead; label: string }[] = [
  { key: "phone", label: "Phone" },
  { key: "teamSize", label: "Team size" },
  { key: "currentWorkflow", label: "Current workflow" },
  { key: "lookingFor", label: "Looking for" },
  { key: "expectedProjects", label: "Expected projects" },
  { key: "storageRequirements", label: "Storage requirements" },
  { key: "aiRequirements", label: "AI requirements" },
  { key: "integrationsNeeded", label: "Integrations needed" },
  { key: "timeline", label: "Timeline" },
];

export default function SuperAdminSalesLeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = use(params);
  const { profile } = useAuthContext();
  const isSuperAdmin = isSuperAdminUser(profile);
  const toast = useToast();
  const [lead, setLead] = useState<SalesLead | null | undefined>(undefined);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activateWorkspaceId, setActivateWorkspaceId] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    getSalesLead(leadId)
      .then((l) => {
        setLead(l);
        if (l?.workspaceId) setActivateWorkspaceId(l.workspaceId);
      })
      .catch((err) => {
        console.error("[super-admin sales detail] failed to load lead:", err);
        setLead(null);
      });
  }, [leadId, isSuperAdmin]);

  async function handleStatusChange(status: SalesLeadStatus) {
    setIsUpdating(true);
    try {
      await updateSalesLeadStatus(leadId, status);
      setLead((prev) => (prev ? { ...prev, status } : prev));
      toast.success(`Marked ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update status");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleActivate() {
    if (!activateWorkspaceId.trim()) {
      toast.error("Enter the workspace ID to activate Enterprise on.");
      return;
    }
    setIsActivating(true);
    try {
      const result = await activateEnterpriseSubscription(leadId, activateWorkspaceId.trim());
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't activate Enterprise.");
        return;
      }
      toast.success("Enterprise subscription activated");
      setLead((prev) => (prev ? { ...prev, status: "won", activatedWorkspaceId: activateWorkspaceId.trim() } : prev));
    } finally {
      setIsActivating(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Sales Lead</h1>
        <p className="text-sm text-foreground-muted">Only the platform Super Admin can view this page.</p>
      </div>
    );
  }

  if (lead === undefined) return <Loader label="Loading lead..." />;
  if (lead === null) return <ErrorState title="Lead not found" message="This sales lead doesn't exist." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={ROUTES.superAdminSales} className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Sales Leads
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">{lead.companyName}</h1>
          <Badge variant={lead.status === "won" ? "success" : lead.status === "lost" ? "danger" : "info"}>{lead.status.toUpperCase()}</Badge>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">Submitted {formatDate(lead.createdAt)}</p>
      </div>

      <SettingsSection title="Contact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contact" value={lead.name} />
          <Field label="Email" value={lead.email} />
          {DETAIL_ROWS.map(({ key, label }) => <Field key={key} label={label} value={lead[key] as string | null} />)}
        </div>
        {lead.message && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">Message</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{lead.message}</p>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Status">
        <div className="flex flex-wrap gap-2">
          {STATUS_FLOW.map(({ key, label }) => (
            <Button key={key} size="sm" variant={lead.status === key ? "primary" : "outline"} onClick={() => handleStatusChange(key)} isLoading={isUpdating}>
              {label}
            </Button>
          ))}
        </div>
      </SettingsSection>

      {lead.status === "won" && (
        <SettingsSection
          title="Activate Enterprise"
          description={
            lead.activatedWorkspaceId
              ? `Already activated on workspace ${lead.activatedWorkspaceId}.`
              : "Enterprise never activates automatically — enter the customer's workspace ID once they've signed up, then activate it here."
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input label="Workspace ID" value={activateWorkspaceId} onChange={(e) => setActivateWorkspaceId(e.target.value)} placeholder="e.g. MLPk1q20KejYTrlUpkT5" className="flex-1" />
            <Button onClick={handleActivate} isLoading={isActivating}>
              {lead.activatedWorkspaceId ? "Re-activate" : "Create / Activate Enterprise Subscription"}
            </Button>
          </div>
        </SettingsSection>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
