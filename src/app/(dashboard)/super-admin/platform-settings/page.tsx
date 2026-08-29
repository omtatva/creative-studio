"use client";

import { Settings2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Super Admin > Platform Settings — placeholder. Global product
 * settings/email configuration/AI provider configuration currently
 * live as environment variables and per-workspace settings docs, not
 * a single platform-wide config document — building that out is a
 * genuinely new subsystem, disclosed here rather than half-built.
 */
export default function SuperAdminPlatformSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Platform Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Global product configuration.</p>
      </div>
      <EmptyState
        icon={<Settings2 className="h-8 w-8" />}
        title="Not built yet"
        description="Global settings (email sending, AI provider config, platform branding) currently live in environment variables and per-workspace settings — a unified platform-wide config page is not yet implemented."
      />
    </div>
  );
}
