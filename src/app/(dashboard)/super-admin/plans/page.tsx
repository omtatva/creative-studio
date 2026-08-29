"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import {
  PLAN_ORDER,
  PLAN_LIMITS,
  PLAN_PRICING,
  PLAN_DISPLAY_NAMES,
  FEATURE_KEYS,
  type FeatureKey,
} from "@/lib/constants/planLimits";

const FEATURE_LABELS: Record<FeatureKey, string> = {
  aiStudio: "AI Studio",
  reviews: "Frame-accurate creative reviews",
  board: "Task board",
  downloads: "Downloads",
  customBranding: "Custom branding",
};

function formatLimit(value: number, unit: "count" | "bytes"): string {
  if (!Number.isFinite(value)) return "Unlimited";
  if (unit === "count") return value.toLocaleString();
  const gb = value / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB` : `${(value / (1024 * 1024)).toFixed(0)} MB`;
}

/**
 * Super Admin > Plans — read-only view of every plan's limits and
 * features, the SAME `PLAN_LIMITS`/`PLAN_PRICING` source of truth the
 * pricing page, Settings > Plan & Usage, and every server-side limit
 * check already read (see PricingSection.tsx's doc comment — nothing
 * here is a separate hardcoded copy).
 *
 * Editing these values isn't wired up yet — they're a source file
 * (lib/constants/planLimits.ts), not a Firestore doc, so a real
 * plan-editing UI would need moving them there first. Enterprise's
 * per-customer overrides already work today via `customEntitlements`
 * on the subscription doc — see the Sales lead detail page's
 * "Activate Enterprise" flow — which covers the actual negotiated-limits
 * need without requiring the base plan table itself to be editable.
 */
export default function SuperAdminPlansPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Plans</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Every plan&apos;s limits and features — the same source every price and limit check in the app reads from.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const pricing = PLAN_PRICING[plan];
          return (
            <SettingsSection key={plan} title={PLAN_DISPLAY_NAMES[plan]}>
              <div className="flex flex-col gap-3">
                <div>
                  {pricing.monthlyUsd !== null ? (
                    <p className="text-2xl font-semibold text-foreground">
                      ${pricing.monthlyUsd}
                      <span className="text-sm font-normal text-foreground-muted">/{pricing.billingPeriod === "forever" ? "forever" : "mo"}</span>
                    </p>
                  ) : (
                    <p className="text-xl font-semibold text-foreground">Custom</p>
                  )}
                </div>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <Row label="Members" value={formatLimit(limits.maxMembers, "count")} />
                  <Row label="Projects" value={formatLimit(limits.maxProjects, "count")} />
                  <Row label="Storage" value={formatLimit(limits.maxStorageBytes, "bytes")} />
                  <Row label="AI generations/mo" value={formatLimit(limits.maxAIRequestsPerMonth, "count")} />
                </dl>
                <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {FEATURE_KEYS.map((f) => (
                    <Badge key={f} variant={limits.enabledFeatures.includes(f) ? "success" : "default"}>
                      {FEATURE_LABELS[f]}
                    </Badge>
                  ))}
                </div>
              </div>
            </SettingsSection>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
