"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Flag } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { getPlanConfig } from "@/services/platformConfigService";
import { mergePlanConfig } from "@/lib/planConfig";
import { PLAN_ORDER, PLAN_DISPLAY_NAMES, FEATURE_KEYS, type FeatureKey } from "@/lib/constants/planLimits";
import type { WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";
import { ROUTES } from "@/lib/constants/routes";
import Link from "next/link";

const FEATURE_INFO: Record<FeatureKey, { label: string; description: string }> = {
  aiStudio: { label: "AI Studio", description: "Server-side AI text/creative generation (Gemini, NVIDIA NIM, or a workspace's own Ollama server), quota-checked and rate-limited per workspace." },
  reviews: { label: "Frame-accurate creative reviews", description: "Timestamped markers, comments, and status on video/image review — the core review workspace." },
  board: { label: "Task board", description: "Kanban-style task board with columns, activity, and preferences per project." },
  downloads: { label: "Downloads", description: "Downloading project files/exports directly from a project." },
  customBranding: { label: "Custom branding", description: "A workspace's own logo, colors, and theme (Settings > Branding), applied via ThemeContext." },
};

const LIMIT_ROWS: { key: keyof WorkspacePlanLimits; label: string; format: (v: number) => string }[] = [
  { key: "maxMembers", label: "Members", format: (v) => (Number.isFinite(v) ? String(v) : "Unlimited") },
  { key: "maxProjects", label: "Active projects", format: (v) => (Number.isFinite(v) ? String(v) : "Unlimited") },
  { key: "maxStorageBytes", label: "Storage", format: (v) => (Number.isFinite(v) ? `${Math.round((v / (1024 * 1024 * 1024)) * 100) / 100} GB` : "Unlimited") },
  { key: "maxAIRequestsPerMonth", label: "AI generations / month", format: (v) => (Number.isFinite(v) ? String(v) : "Unlimited") },
];

/**
 * Super Admin > Features — a READ-ONLY overview of every capability
 * actually implemented and entitlement-gated in this codebase (see
 * lib/constants/planLimits.ts's FEATURE_KEYS/PLAN_LIMITS, the same
 * source of truth planService.ts's canUseFeature/checkWorkspaceLimit
 * and the server-side enforcement in workspaceQuota.ts and
 * /api/ai-studio/generate read from). Reads the SAME live-merged
 * config (platform_config/plans over the static defaults) that
 * Super Admin > Plans edits and the public pricing page displays —
 * this page never invents its own numbers.
 *
 * Deliberately NOT an editable feature-flag system: this app has no
 * `feature_flags` collection or runtime flag-check anywhere, and
 * building one (gradual rollouts, kill-switches independent of plan)
 * is a genuinely separate subsystem — building a fake one here would
 * violate the "no invented functionality" rule. Editing what's shown
 * here happens at Super Admin > Plans, which this page links to.
 *
 * Authorization: this route renders only inside SuperAdminLayout,
 * which is a UI convenience — the REAL enforcement is that every
 * number shown here is read via the client SDK from
 * platform_config/plans, whose Firestore rule already requires
 * nothing (public read, by design — see platformConfig.types.ts) and
 * whose WRITE side is Super-Admin-only. Nothing on this page performs
 * a write, so there is no privileged action to gate here beyond the
 * page's own visibility.
 */
export default function SuperAdminFeaturesPage() {
  const [limits, setLimits] = useState<Record<WorkspacePlan, WorkspacePlanLimits> | null>(null);

  useEffect(() => {
    getPlanConfig()
      .then((live) => setLimits(mergePlanConfig(live).limits))
      .catch((err) => {
        console.error("[super-admin/features] failed to load plan config:", err);
        setLimits(mergePlanConfig(null).limits);
      });
  }, []);

  if (!limits) return <Loader label="Loading features..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Features</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Every implemented, entitlement-gated capability and which plans include it. To change availability or limits, use{" "}
          <Link href={ROUTES.superAdminPlans} className="font-medium text-primary hover:underline">
            Plans
          </Link>
          .
        </p>
      </div>

      <SettingsSection title="Capabilities">
        <div className="flex flex-col divide-y divide-border">
          {FEATURE_KEYS.map((feature) => {
            const info = FEATURE_INFO[feature];
            return (
              <div key={feature} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Flag className="h-4 w-4 text-foreground-muted" />
                  <span className="font-medium text-foreground">{info.label}</span>
                  <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-foreground-muted">{feature}</code>
                </div>
                <p className="text-sm text-foreground-muted">{info.description}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {PLAN_ORDER.map((plan) => {
                    const isOn = limits[plan].enabledFeatures.includes(feature);
                    return (
                      <Badge key={plan} variant={isOn ? "success" : "default"} className="gap-1">
                        {isOn ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {PLAN_DISPLAY_NAMES[plan]}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Quota limits by plan">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground-muted">
                <th className="py-2 pr-4 font-medium">Limit</th>
                {PLAN_ORDER.map((plan) => (
                  <th key={plan} className="py-2 pr-4 font-medium">{PLAN_DISPLAY_NAMES[plan]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {LIMIT_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="py-2 pr-4 text-foreground-muted">{row.label}</td>
                  {PLAN_ORDER.map((plan) => (
                    <td key={plan} className="py-2 pr-4 text-foreground">{row.format(limits[plan][row.key] as number)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-foreground-muted">
          Member and project limits are enforced server-side via transactional counters (see workspaceQuota.ts) — a workspace cannot exceed these by calling the API directly or racing simultaneous requests.
        </p>
      </SettingsSection>
    </div>
  );
}
