"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { getPlanConfig } from "@/services/platformConfigService";
import { mergePlanConfig } from "@/lib/planConfig";
import {
  PLAN_ORDER,
  PLAN_DISPLAY_NAMES,
  FEATURE_KEYS,
  type FeatureKey,
} from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";
import { SectionWrapper } from "../SectionWrapper";
import { ContactSalesModal } from "./ContactSalesModal";

/**
 * Renders from the static PLAN_LIMITS/PLAN_PRICING defaults first (no
 * loading flash on a marketing page), then swaps in Super Admin >
 * Plans' live edits (platform_config/plans, public read — see
 * mergePlanConfig) as soon as they load. A plan nobody has ever
 * edited keeps showing exactly its static defaults forever.
 */
const FEATURE_LABELS: Record<FeatureKey, string> = {
  aiStudio: "AI Studio",
  reviews: "Frame-accurate creative reviews",
  board: "Task board",
  downloads: "Downloads",
  customBranding: "Custom branding",
};

const HIGHLIGHTED_PLAN: WorkspacePlan = "pro";

function formatLimit(value: number, unit: "count" | "bytes"): string {
  if (!Number.isFinite(value)) return "Unlimited";
  if (unit === "count") return value.toLocaleString();
  const gb = value / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB` : `${(value / (1024 * 1024)).toFixed(0)} MB`;
}

function ctaLabel(plan: WorkspacePlan): string {
  if (plan === "starter") return "Start Free";
  if (plan === "enterprise") return "Contact Sales";
  return `Choose ${PLAN_DISPLAY_NAMES[plan]}`;
}

export function PricingSection() {
  const router = useRouter();
  const [isContactSalesOpen, setIsContactSalesOpen] = useState(false);
  const [planData, setPlanData] = useState(() => mergePlanConfig(null));

  useEffect(() => {
    getPlanConfig()
      .then((live) => setPlanData(mergePlanConfig(live)))
      .catch((err) => console.error("[PricingSection] failed to load live plan config, showing defaults:", err));
  }, []);

  function handleCta(plan: WorkspacePlan) {
    if (plan === "enterprise") {
      setIsContactSalesOpen(true);
      return;
    }
    router.push(`/signup?plan=${plan}`);
  }

  return (
    <SectionWrapper id="pricing" className="max-w-6xl">
      <div id="contact-sales" />
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Pricing</p>
        <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">Simple plans that grow with your team.</h2>
        <p className="mt-4 text-base leading-relaxed text-foreground-muted">
          Start free, upgrade when your team needs more room. No credit card required to get started.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((plan) => {
          const limits = planData.limits[plan];
          const pricing = planData.pricing[plan];
          const isHighlighted = plan === HIGHLIGHTED_PLAN;

          return (
            <div
              key={plan}
              className={cn(
                "relative flex flex-col rounded-theme border bg-cards/60 p-6 shadow-soft backdrop-blur-glass transition-all duration-200 hover:-translate-y-1",
                isHighlighted ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
              )}
            >
              {isHighlighted && (
                <Badge variant="info" className="absolute -top-3 left-6">
                  Most popular
                </Badge>
              )}

              <h3 className="text-lg font-semibold text-foreground">{PLAN_DISPLAY_NAMES[plan]}</h3>

              <div className="mt-3 flex items-baseline gap-1.5">
                {pricing.monthlyUsd !== null ? (
                  <>
                    <span className="text-3xl font-semibold text-foreground">${pricing.monthlyUsd}</span>
                    <span className="text-sm text-foreground-muted">/{pricing.billingPeriod === "forever" ? "forever" : "mo"}</span>
                  </>
                ) : (
                  <span className="text-2xl font-semibold text-foreground">Custom</span>
                )}
              </div>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-foreground-muted">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {formatLimit(limits.maxMembers, "count")} members
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {formatLimit(limits.maxProjects, "count")} active projects
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {formatLimit(limits.maxStorageBytes, "bytes")} storage
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {formatLimit(limits.maxAIRequestsPerMonth, "count")} AI generations/mo
                </li>
                {FEATURE_KEYS.filter((f) => limits.enabledFeatures.includes(f)).map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    {FEATURE_LABELS[f]}
                  </li>
                ))}
              </ul>

              <Button
                variant={isHighlighted ? "primary" : "outline"}
                className="mt-6 w-full"
                onClick={() => handleCta(plan)}
              >
                {ctaLabel(plan)}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-foreground-muted">
        Paid plans activate once payment is confirmed — your workspace stays on the Free plan&apos;s limits until then.
      </p>

      <ContactSalesModal isOpen={isContactSalesOpen} onClose={() => setIsContactSalesOpen(false)} />
    </SectionWrapper>
  );
}
