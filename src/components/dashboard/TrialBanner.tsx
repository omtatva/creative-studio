"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { getWorkspaceSubscription } from "@/services/subscriptionService";
import { isTrialExpired } from "@/lib/entitlements";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
import type { WorkspaceSubscription } from "@/types/billing.types";

function daysRemaining(trialEnd: string): number {
  return Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

/**
 * Dashboard trial banner — "work in a 7-day trial, then get prompted
 * to upgrade" (see /api/billing/start-trial). Reads the SUBSCRIPTION
 * DOC LIVE rather than the workspace's cached `.plan`/`.limits`
 * fields, and uses isTrialExpired (entitlements.ts) to decide what to
 * show — that cache only re-syncs on the next real subscription
 * event, so it can't be trusted to reflect "trial just ended" the
 * moment it actually happens.
 *
 * Renders nothing for: no subscription doc at all (a workspace that
 * never started a trial — e.g. Omtatva's own internal workspace,
 * which is exempt from plan limits entirely and was never put through
 * this flow), an active paid plan, or a canceled/paused one (Settings
 * > Billing & Plan already covers those states). Only owner/admin see
 * this — an employee can't act on it anyway.
 */
export function TrialBanner() {
  const router = useRouter();
  const { workspace } = useWorkspaceContext();
  const { canManageWorkspace } = useCurrentMemberRole();
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null | undefined>(undefined);

  useEffect(() => {
    if (!workspace) return;
    getWorkspaceSubscription(workspace.id)
      .then(setSubscription)
      .catch(() => setSubscription(null));
  }, [workspace]);

  if (!workspace || !canManageWorkspace || !subscription || subscription.status !== "trialing" || !subscription.trialEnd) {
    return null;
  }

  const expired = isTrialExpired(subscription);
  const remaining = expired ? 0 : daysRemaining(subscription.trialEnd);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-theme border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-3">
        {expired ? <Clock className="h-5 w-5 shrink-0 text-warning" /> : <Sparkles className="h-5 w-5 shrink-0 text-primary" />}
        <div>
          <p className="text-sm font-medium text-foreground">
            {expired
              ? `Your ${PLAN_DISPLAY_NAMES[subscription.planId]} trial has ended`
              : `${PLAN_DISPLAY_NAMES[subscription.planId]} trial — ${remaining} day${remaining === 1 ? "" : "s"} remaining`}
          </p>
          <p className="text-xs text-foreground-muted">
            {expired
              ? `You're back on the ${PLAN_DISPLAY_NAMES.starter} plan's limits. Upgrade to keep ${PLAN_DISPLAY_NAMES[subscription.planId]} features.`
              : "Upgrade any time to keep these features after your trial ends."}
          </p>
        </div>
      </div>
      <Button size="sm" variant={expired ? "primary" : "outline"} onClick={() => router.push(ROUTES.settingsBilling)}>
        Upgrade Plan
      </Button>
    </div>
  );
}
