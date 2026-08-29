"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { useToast } from "@/hooks/useToast";
import { useAuthContext } from "@/contexts/AuthContext";
import { getPlanConfig, updatePlanConfig } from "@/services/platformConfigService";
import { mergePlanConfig } from "@/lib/planConfig";
import { PLAN_ORDER, PLAN_DISPLAY_NAMES, FEATURE_KEYS, type FeatureKey } from "@/lib/constants/planLimits";
import type { PlanConfigEntry } from "@/types/platformConfig.types";
import type { WorkspacePlan } from "@/types/workspace.types";

const FEATURE_LABELS: Record<FeatureKey, string> = {
  aiStudio: "AI Studio",
  reviews: "Frame-accurate creative reviews",
  board: "Task board",
  downloads: "Downloads",
  customBranding: "Custom branding",
};

const BYTES_PER_GB = 1024 * 1024 * 1024;

function toGb(bytes: number): string {
  return Number.isFinite(bytes) ? String(Math.round((bytes / BYTES_PER_GB) * 100) / 100) : "";
}

/**
 * Super Admin > Plans — the ACTUAL editing UI for every plan's price
 * and limits/features ("cost and services"). Saving here writes to
 * platform_config/plans (see platformConfigService.ts), which the
 * public pricing page reads live — see PricingSection.tsx's doc
 * comment for the merge-over-static-defaults behavior that makes an
 * unedited plan show exactly what it always showed.
 *
 * Scope note (disclosed, not silently gapped): a save here updates
 * the MARKETING DISPLAY immediately, and any NEW subscription event
 * from this point on (checkout, plan change, manual/Enterprise
 * activation, webhook) resolves against these new numbers too — see
 * billingAdmin.ts. It does NOT retroactively rewrite the cached
 * `limits` already stored on existing active subscriptions; those
 * update the next time that specific workspace's subscription
 * changes. A mass background rewrite across every workspace on every
 * plan edit was deliberately not built — it's a much bigger, riskier
 * change for a rare admin action.
 */
export default function SuperAdminPlansPage() {
  const { firebaseUser } = useAuthContext();
  const toast = useToast();
  const [entries, setEntries] = useState<Record<WorkspacePlan, PlanConfigEntry> | null>(null);
  const [savingPlan, setSavingPlan] = useState<WorkspacePlan | null>(null);

  useEffect(() => {
    getPlanConfig()
      .then((live) => {
        const { limits, pricing } = mergePlanConfig(live);
        const merged = Object.fromEntries(
          PLAN_ORDER.map((plan) => [plan, { ...limits[plan], ...pricing[plan] }])
        ) as Record<WorkspacePlan, PlanConfigEntry>;
        setEntries(merged);
      })
      .catch((err) => {
        console.error("[super-admin/plans] failed to load plan config:", err);
        toast.error("Couldn't load plan config — showing defaults.");
        const { limits, pricing } = mergePlanConfig(null);
        setEntries(Object.fromEntries(PLAN_ORDER.map((plan) => [plan, { ...limits[plan], ...pricing[plan] }])) as Record<WorkspacePlan, PlanConfigEntry>);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchEntry(plan: WorkspacePlan, patch: Partial<PlanConfigEntry>) {
    setEntries((prev) => (prev ? { ...prev, [plan]: { ...prev[plan], ...patch } } : prev));
  }

  function toggleFeature(plan: WorkspacePlan, feature: FeatureKey) {
    if (!entries) return;
    const current = entries[plan].enabledFeatures;
    const next = current.includes(feature) ? current.filter((f) => f !== feature) : [...current, feature];
    patchEntry(plan, { enabledFeatures: next });
  }

  async function handleSave(plan: WorkspacePlan) {
    if (!entries || !firebaseUser) return;
    setSavingPlan(plan);
    try {
      await updatePlanConfig(plan, entries[plan], firebaseUser.uid);
      toast.success(`${PLAN_DISPLAY_NAMES[plan]} saved — the pricing page updates immediately.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save this plan.");
    } finally {
      setSavingPlan(null);
    }
  }

  if (!entries) return <Loader label="Loading plans..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Plans</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Edit each plan&apos;s price and limits — saved changes show on the pricing page immediately.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PLAN_ORDER.map((plan) => {
          const entry = entries[plan];
          const isCustomPricing = entry.monthlyUsd === null;
          const isUnlimited = (key: keyof PlanConfigEntry) => !Number.isFinite(entry[key] as number);

          return (
            <SettingsSection
              key={plan}
              title={PLAN_DISPLAY_NAMES[plan]}
              action={
                <Button size="sm" onClick={() => handleSave(plan)} isLoading={savingPlan === plan}>
                  Save
                </Button>
              }
            >
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Monthly price (USD)"
                    type="number"
                    min={0}
                    value={isCustomPricing ? "" : (entry.monthlyUsd ?? 0)}
                    placeholder={isCustomPricing ? "Custom" : undefined}
                    disabled={isCustomPricing}
                    onChange={(e) => patchEntry(plan, { monthlyUsd: e.target.value === "" ? 0 : Number(e.target.value) })}
                  />
                  <label className="flex items-end gap-2 pb-2 text-sm text-foreground-muted">
                    <input
                      type="checkbox"
                      checked={isCustomPricing}
                      onChange={(e) => patchEntry(plan, { monthlyUsd: e.target.checked ? null : 0, billingPeriod: e.target.checked ? "custom" : "per month" })}
                    />
                    Custom pricing (&quot;Contact Sales&quot;)
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
                  <NumberOrUnlimitedField
                    label="Members"
                    value={entry.maxMembers}
                    onChange={(v) => patchEntry(plan, { maxMembers: v })}
                  />
                  <NumberOrUnlimitedField
                    label="Projects"
                    value={entry.maxProjects}
                    onChange={(v) => patchEntry(plan, { maxProjects: v })}
                  />
                  <NumberOrUnlimitedField
                    label="Storage (GB)"
                    value={isUnlimited("maxStorageBytes") ? Infinity : Number(toGb(entry.maxStorageBytes))}
                    onChange={(v) => patchEntry(plan, { maxStorageBytes: Number.isFinite(v) ? v * BYTES_PER_GB : Infinity })}
                  />
                  <NumberOrUnlimitedField
                    label="AI generations/mo"
                    value={entry.maxAIRequestsPerMonth}
                    onChange={(v) => patchEntry(plan, { maxAIRequestsPerMonth: v })}
                  />
                </div>

                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Services included</p>
                  <div className="flex flex-wrap gap-2">
                    {FEATURE_KEYS.map((f) => {
                      const isOn = entry.enabledFeatures.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => toggleFeature(plan, f)}
                        >
                          <Badge variant={isOn ? "success" : "default"} className="cursor-pointer">
                            {FEATURE_LABELS[f]}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </SettingsSection>
          );
        })}
      </div>
    </div>
  );
}

function NumberOrUnlimitedField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const isUnlimited = !Number.isFinite(value);
  return (
    <div className="flex flex-col gap-1">
      <Input
        label={label}
        type="number"
        min={0}
        value={isUnlimited ? "" : value}
        placeholder={isUnlimited ? "Unlimited" : undefined}
        disabled={isUnlimited}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
      <label className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
        <input type="checkbox" checked={isUnlimited} onChange={(e) => onChange(e.target.checked ? Infinity : 0)} />
        Unlimited
      </label>
    </div>
  );
}
