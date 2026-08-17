"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { TagsInput } from "@/components/projects/TagsInput";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_SECURITY_SETTINGS } from "@/lib/constants/settingsDefaults";
import { SecuritySettings } from "@/types/settings.types";

export default function SecuritySettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings.security ?? DEFAULT_SECURITY_SETTINGS);
  }, [settings]);

  async function handleSave() {
    if (draft.sessionTimeoutMinutes < 5 || draft.sessionTimeoutMinutes > 1440) {
      setError("Session timeout must be between 5 and 1440 minutes");
      return;
    }
    if (draft.passwordPolicy.minLength < 6) {
      setError("Minimum password length must be at least 6");
      return;
    }
    setError(null);
    try {
      await save({ security: draft });
      toast.success("Security settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    }
  }

  if (isLoading) return <Loader label="Loading security settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Security</h1>
        <p className="mt-1 text-sm text-foreground-muted">Password policy, sessions, and two-factor authentication.</p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <SettingsSection
        title="Two-factor authentication"
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving}>Save changes</Button>}
      >
        <ToggleSwitch
          checked={draft.twoFactorRequired}
          onChange={(v) => setDraft({ ...draft, twoFactorRequired: v })}
          label="Require 2FA for all members"
          description="Members will be prompted to set up two-factor authentication on next login"
        />
      </SettingsSection>

      <SettingsSection title="Sessions">
        <Input
          label="Session timeout (minutes)"
          type="number"
          min={5}
          max={1440}
          value={draft.sessionTimeoutMinutes}
          onChange={(e) => setDraft({ ...draft, sessionTimeoutMinutes: Number(e.target.value) })}
          hint="Members are signed out after this many minutes of inactivity"
        />
      </SettingsSection>

      <SettingsSection title="Password policy">
        <div className="flex flex-col gap-4">
          <Input
            label="Minimum length"
            type="number"
            min={6}
            max={64}
            value={draft.passwordPolicy.minLength}
            onChange={(e) => setDraft({ ...draft, passwordPolicy: { ...draft.passwordPolicy, minLength: Number(e.target.value) } })}
          />
          <ToggleSwitch
            checked={draft.passwordPolicy.requireUppercase}
            onChange={(v) => setDraft({ ...draft, passwordPolicy: { ...draft.passwordPolicy, requireUppercase: v } })}
            label="Require an uppercase letter"
          />
          <ToggleSwitch
            checked={draft.passwordPolicy.requireNumber}
            onChange={(v) => setDraft({ ...draft, passwordPolicy: { ...draft.passwordPolicy, requireNumber: v } })}
            label="Require a number"
          />
          <ToggleSwitch
            checked={draft.passwordPolicy.requireSymbol}
            onChange={(v) => setDraft({ ...draft, passwordPolicy: { ...draft.passwordPolicy, requireSymbol: v } })}
            label="Require a symbol"
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Allowed email domains" description="Leave empty to allow any email domain to sign up.">
        <TagsInput value={draft.allowedEmailDomains} onChange={(domains) => setDraft({ ...draft, allowedEmailDomains: domains })} placeholder="company.com, then Enter" />
      </SettingsSection>
    </div>
  );
}
