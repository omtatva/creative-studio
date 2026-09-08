"use client";

import { useEffect, useState } from "react";
import { Mail, Sparkles, ShieldCheck, Palette, CreditCard, LifeBuoy, Construction, ScrollText } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useToast } from "@/hooks/useToast";
import { getPlatformSettings, updatePlatformSettings, getPlatformIntegrationStatus } from "@/services/platformSettingsService";
import { getGmailConnectionStatus } from "@/services/gmailConnectionService";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants/itSupport";
import type { PlatformSettings, PlatformIntegrationStatus } from "@/types/platformSettings.types";
import type { GmailConnectionStatus } from "@/types/gmail.types";

/**
 * Super Admin > Platform Settings — a real GLOBAL configuration
 * center, distinct from a workspace's own Settings (workspace admins
 * cannot read or write ANY of this — see firestore.rules'
 * platform_settings block and /api/platform-settings/update's
 * verifySuperAdminAuth). Backed by a dedicated `platform_settings/global`
 * singleton doc (see platformSettings.types.ts) rather than being
 * folded into any workspace document.
 *
 * Every section below either edits a real field on that doc, or
 * displays REAL derived status from an existing system (Gmail
 * connection, AI provider env vars, security headers/rate limiting
 * already implemented in this codebase) — nothing here is a mocked
 * number or a switch with no effect. Where this app genuinely has no
 * implementation yet (a connected payment provider), the page says so
 * explicitly instead of pretending otherwise.
 */
export default function SuperAdminPlatformSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [status, setStatus] = useState<PlatformIntegrationStatus | null>(null);
  const [gmail, setGmail] = useState<GmailConnectionStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);

  useEffect(() => {
    getPlatformSettings()
      .then((s) => {
        setSettings(s);
        setDraft(s);
      })
      .catch((err) => {
        console.error("[super-admin/platform-settings] failed to load settings:", err);
        toast.error("Couldn't load platform settings.");
      });
    getPlatformIntegrationStatus()
      .then(setStatus)
      .catch((err) => console.error("[super-admin/platform-settings] failed to load status:", err));
    getGmailConnectionStatus()
      .then(setGmail)
      .catch((err) => console.error("[super-admin/platform-settings] failed to load Gmail status:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty =
    !!settings &&
    !!draft &&
    (settings.platformName !== draft.platformName ||
      settings.platformUrl !== draft.platformUrl ||
      settings.supportEmail !== draft.supportEmail ||
      settings.timezone !== draft.timezone);

  async function handleSaveGeneral() {
    if (!draft) return;
    setIsSaving(true);
    try {
      const next = await updatePlatformSettings({
        platformName: draft.platformName,
        platformUrl: draft.platformUrl,
        supportEmail: draft.supportEmail,
        timezone: draft.timezone,
      });
      setSettings(next);
      setDraft(next);
      toast.success("Platform settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save platform settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleMaintenance(next: boolean) {
    if (!settings) return;
    setIsSavingMaintenance(true);
    try {
      const updated = await updatePlatformSettings({ maintenanceMode: next });
      setSettings(updated);
      setDraft((prev) => (prev ? { ...prev, maintenanceMode: next } : prev));
      toast.success(next ? "Maintenance mode enabled — Super Admin retains access." : "Maintenance mode disabled.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update maintenance mode.");
    } finally {
      setIsSavingMaintenance(false);
    }
  }

  if (!settings || !draft) return <Loader label="Loading platform settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Platform Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Global product configuration — separate from any single workspace&apos;s own Settings.</p>
      </div>

      <SettingsSection
        title="General"
        action={
          <Button size="sm" onClick={handleSaveGeneral} isLoading={isSaving} disabled={!isDirty}>
            Save
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Platform name" value={draft.platformName} onChange={(e) => setDraft({ ...draft, platformName: e.target.value })} />
          <Input label="Platform URL" value={draft.platformUrl} onChange={(e) => setDraft({ ...draft, platformUrl: e.target.value })} />
          <Input label="Support email" type="email" value={draft.supportEmail} onChange={(e) => setDraft({ ...draft, supportEmail: e.target.value })} />
          <Input label="Timezone" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} hint="IANA timezone, e.g. Asia/Kolkata" />
        </div>
        {settings.updatedBy && <p className="mt-3 text-xs text-foreground-muted">Last changed by {settings.updatedBy}.</p>}
      </SettingsSection>

      <SettingsSection title="Email" description="Gmail integration used to send workspace-invitation emails.">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-foreground-muted" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{gmail?.connected ? gmail.email : "Not connected"}</p>
            <p className="text-xs text-foreground-muted">
              {gmail === null ? "Checking..." : gmail.connected ? "Your own Gmail account is connected and can send invitation emails." : "Connect a Gmail account from Settings > Email to send invitations from a real address."}
            </p>
          </div>
          <Badge variant={gmail?.connected ? "success" : "default"}>{gmail?.connected ? "Connected" : "Not connected"}</Badge>
        </div>
        <p className="mt-3 text-xs text-foreground-muted">Gmail is connected per Super Admin account, not as a single platform-wide sender — this reflects your own account&apos;s connection.</p>
      </SettingsSection>

      <SettingsSection title="AI Providers" description="Server-side provider configuration — keys are never shown, only whether one is configured.">
        {!status ? (
          <Loader label="Loading status..." />
        ) : (
          <div className="flex flex-col gap-3">
            <ProviderRow icon={<Sparkles className="h-4 w-4" />} name="Gemini" model={status.ai.gemini.defaultModel} configured={status.ai.gemini.configured} />
            <ProviderRow icon={<Sparkles className="h-4 w-4" />} name="NVIDIA NIM" model={status.ai.nvidia.defaultModel} configured={status.ai.nvidia.configured} />
            <div className="flex items-center gap-3 border-t border-border pt-3">
              <Sparkles className="h-4 w-4 text-foreground-muted" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Ollama</p>
                <p className="text-xs text-foreground-muted">{status.ai.ollama.note}</p>
              </div>
              <Badge variant="info">Per-workspace</Badge>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Branding" description="Fixed platform identity — see a workspace's own Settings > Branding for per-workspace logo/colors.">
        <div className="flex items-center gap-3">
          <Palette className="h-5 w-5 text-foreground-muted" />
          <div>
            <p className="text-sm font-medium text-foreground">Omtatva Digitals — Creative Studio</p>
            <p className="text-xs text-foreground-muted">A global white-label override (separate logo/name for the whole platform) has no render path implemented yet — disclosed here rather than added as a non-functional field.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Security" description="Real status — no destructive toggles live here.">
        {!status ? (
          <Loader label="Loading status..." />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <StatusRow icon={<ShieldCheck className="h-4 w-4" />} label="Authentication" value={status.security.authProvider} />
            <StatusRow icon={<ShieldCheck className="h-4 w-4" />} label="Session model" value={status.security.sessionModel} />
            <StatusRow icon={<ShieldCheck className="h-4 w-4" />} label="Rate limiting" value={status.security.rateLimiting} />
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" />
              <div>
                <p className="font-medium text-foreground">Security headers</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {status.security.securityHeaders.map((h) => (
                    <Badge key={h} variant="success">{h}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Billing / Subscription" description="Plan pricing and entitlements — edit at Super Admin > Plans.">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-foreground-muted" />
          <div>
            <p className="text-sm font-medium text-foreground">Payment Provider: Not connected</p>
            <p className="text-xs text-foreground-muted">Plans, pricing, and per-workspace subscription state are fully implemented (see Super Admin &gt; Plans / Billing); no live payment provider (Stripe/Razorpay/Paddle) is wired up yet.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Support">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-5 w-5 text-foreground-muted" />
          <div>
            <p className="text-sm font-medium text-foreground">{SUPER_ADMIN_EMAIL}</p>
            <p className="text-xs text-foreground-muted">The designated IT Support / Super Admin account for this platform.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Maintenance">
        <ToggleSwitch
          checked={draft.maintenanceMode}
          onChange={handleToggleMaintenance}
          label="Maintenance mode"
          description="Blocks the authenticated app for everyone except Super Admin, who always retains access."
          disabled={isSavingMaintenance}
        />
        {draft.maintenanceMode && (
          <div className="mt-3 flex items-center gap-2 rounded-theme border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <Construction className="h-4 w-4 shrink-0" />
            Maintenance mode is ON — every non-Super-Admin account currently sees a maintenance screen instead of the app.
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Audit" description="Every platform-settings change is logged.">
        <div className="flex items-center gap-3">
          <ScrollText className="h-5 w-5 text-foreground-muted" />
          <p className="text-sm text-foreground-muted">
            Changes made on this page are recorded in{" "}
            <a href="/super-admin/audit-logs" className="font-medium text-primary hover:underline">
              Audit Logs
            </a>{" "}
            as <code className="rounded bg-surface-muted px-1 py-0.5 text-[11px]">platform_settings_updated</code>, with the changed field names and who made the change — never any secret value.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}

function ProviderRow({ icon, name, model, configured }: { icon: React.ReactNode; name: string; model: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <span className="text-foreground-muted">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-foreground-muted">Default model: {model}</p>
      </div>
      <Badge variant={configured ? "success" : "default"}>{configured ? "Configured" : "Not configured"}</Badge>
    </div>
  );
}

function StatusRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-foreground-muted">{icon}</span>
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-foreground-muted">{value}</p>
      </div>
    </div>
  );
}
