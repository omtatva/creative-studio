"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPlatformAuditLogs } from "@/services/platformAuditService";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils/date";
import type { PlatformAuditLogEntry, PlatformAuditAction } from "@/types/platformAudit.types";

const ACTION_LABEL: Record<PlatformAuditAction, string> = {
  plan_activated: "Plan activated",
  enterprise_activated: "Enterprise activated",
  subscription_status_changed: "Subscription status changed",
};

/** Super Admin > Audit Logs — every Super Admin action, see platformAudit.types.ts. Read-only. */
export default function SuperAdminAuditLogsPage() {
  const [logs, setLogs] = useState<PlatformAuditLogEntry[] | null>(null);

  useEffect(() => {
    getPlatformAuditLogs()
      .then(setLogs)
      .catch((err) => {
        console.error("[super-admin/audit-logs] failed to load logs:", err);
        setLogs([]);
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Audit Logs</h1>
        <p className="mt-1 text-sm text-foreground-muted">Every Super Admin action taken on the platform.</p>
      </div>

      <SettingsSection title={`${logs?.length ?? "..."} entr${logs?.length === 1 ? "y" : "ies"}`}>
        {!logs ? (
          <Loader label="Loading audit logs..." />
        ) : logs.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-8 w-8" />} title="No actions logged yet" description="Plan activations, Enterprise activations, and subscription status changes will show up here." />
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 rounded-theme border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="info">{ACTION_LABEL[log.action] ?? log.action}</Badge>
                    <Link href={`${ROUTES.superAdminCustomers}/${log.workspaceId}`} className="truncate text-sm font-medium text-foreground hover:underline">
                      {log.workspaceId}
                    </Link>
                  </div>
                  {Object.keys(log.details).length > 0 && (
                    <p className="mt-1 truncate text-xs text-foreground-muted">{JSON.stringify(log.details)}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-foreground-muted">{formatDate(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
