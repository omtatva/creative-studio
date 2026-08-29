"use client";

import { Flag } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Super Admin > Features — placeholder. This app has no feature-flag
 * infrastructure to extend yet (no `feature_flags` collection, no
 * runtime flag-check anywhere in the codebase) — per-plan feature
 * gating already exists via PLAN_LIMITS.enabledFeatures (see
 * planLimits.ts / Super Admin > Plans), but a SEPARATE flag system for
 * gradual rollouts/kill-switches independent of plan is a genuinely
 * new subsystem, disclosed here rather than half-built.
 */
export default function SuperAdminFeaturesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Features</h1>
        <p className="mt-1 text-sm text-foreground-muted">Platform-wide feature flags.</p>
      </div>
      <EmptyState
        icon={<Flag className="h-8 w-8" />}
        title="Not built yet"
        description="Per-plan feature gating already exists (see Plans) — a separate flag system for gradual rollouts or kill-switches is a larger, separate addition not yet implemented."
      />
    </div>
  );
}
