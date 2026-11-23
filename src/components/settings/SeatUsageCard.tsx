"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";

const SOURCE_LABEL = { trial: "Trial", paid: "Paid", manual: "Complimentary", free: "Free" } as const;

/**
 * Read-only seat usage for a workspace Owner/Admin: "3 / 15 members used - 12 seats remaining - Plan Pro". The numbers come from the resolved
 * entitlements (the same server policy everything else reads, kept fresh by EntitlementsContext), and there is deliberately no way to change the limit
 * here: seats are part of the plan, and only the platform (Super Admin > Customers > Plan & entitlements) can grant more.
 */
export function SeatUsageCard() {
  const { entitlements, error } = useEntitlements();
  if (error && !entitlements) return <p className="text-xs text-foreground-muted">Seat usage unavailable: {error}</p>;
  if (!entitlements?.members) return null;

  const { members } = entitlements;
  const full = members.limit !== null && members.used >= members.limit;
  return (
    <SettingsSection
      title="Seats"
      description="Seats are part of your plan. A seat is used by every active member (owner, admin, member or viewer). Disabled members and pending invitations don't use one."
      action={<Badge variant={full ? "warning" : "info"}>{PLAN_DISPLAY_NAMES[entitlements.plan as WorkspacePlan] ?? entitlements.plan} · {SOURCE_LABEL[entitlements.billingSource]}</Badge>}
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <p className="text-foreground">
          <span className="text-lg font-semibold">{members.used}</span>
          <span className="text-foreground-muted"> / {members.limit ?? "unlimited"} members used</span>
        </p>
        {members.remaining !== null && (
          <p className={full ? "font-medium text-warning" : "text-foreground-muted"}>{full ? "No seats left" : `${members.remaining} seat${members.remaining === 1 ? "" : "s"} remaining`}</p>
        )}
        {members.disabled > 0 && <p className="text-foreground-muted">{members.disabled} disabled (no seat)</p>}
        {members.pendingInvites > 0 && <p className="text-foreground-muted">{members.pendingInvites} invitation{members.pendingInvites === 1 ? "" : "s"} pending</p>}
        {members.source === "override" && <p className="text-foreground-muted">Includes a custom seat limit set by the platform</p>}
      </div>
      {full && <p className="mt-2 text-xs text-warning">New people can&apos;t join until a seat is freed or the plan is upgraded.</p>}
    </SettingsSection>
  );
}
