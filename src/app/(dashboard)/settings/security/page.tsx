"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { TagsInput } from "@/components/projects/TagsInput";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_SECURITY_SETTINGS } from "@/lib/constants/settingsDefaults";

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
const normalizeDomain = (value: string) => value.trim().toLowerCase().replace(/^@/, "");

/**
 * Security. Only what is actually enforced is editable here: the allowed email domains, which /api/invites/accept applies on the server at the
 * moment someone tries to join. Two-factor, session timeout and password rules are NOT enforced per workspace (sign-in is handled by the
 * platform's authentication, shared across every workspace a person belongs to), so they are shown as information rather than as switches
 * that would look like they protect something.
 */
export default function SecuritySettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const toast = useToast();
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const saved = settings?.security?.allowedEmailDomains ?? [];
  useEffect(() => {
    if (settings) setDomains(settings.security?.allowedEmailDomains ?? []);
  }, [settings]);

  const dirty = JSON.stringify(domains) !== JSON.stringify(saved);

  async function handleSave() {
    const cleaned = Array.from(new Set(domains.map(normalizeDomain).filter(Boolean)));
    const invalid = cleaned.find((d) => !DOMAIN_PATTERN.test(d));
    if (invalid) {
      setError(`"${invalid}" isn't a valid domain. Use a form like company.com.`);
      return;
    }
    setError(null);
    try {
      // Keep every other stored security value exactly as it is — only the allowed domains change here.
      await save({ security: { ...DEFAULT_SECURITY_SETTINGS, ...(settings?.security ?? {}), allowedEmailDomains: cleaned } });
      setDomains(cleaned);
      toast.success("Allowed email domains saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    }
  }

  if (isLoading) return <Loader label="Loading security settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Security</h1>
        <p className="mt-1 text-sm text-foreground-muted">Who is allowed to join this workspace.</p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <SettingsSection
        title="Allowed email domains"
        description="When set, people can only join this workspace with an email at one of these domains. Leave empty to allow any domain. Checked when an invitation is accepted; people who are already members are not affected."
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving} disabled={!dirty}>Save changes</Button>}
      >
        <TagsInput value={domains} onChange={setDomains} placeholder="company.com, then Enter" />
      </SettingsSection>

      <SettingsSection title="Sign-in security" description="Managed by the platform, not per workspace.">
        <ul className="flex flex-col gap-2 text-sm text-foreground-muted">
          <li>Everyone must verify their email address before they can accept an invitation (enforced).</li>
          <li>Passwords and sessions are handled by the platform&apos;s sign-in system and are the same in every workspace a person belongs to.</li>
          <li>Per-workspace two-factor authentication, session timeouts and password rules are not available yet.</li>
        </ul>
      </SettingsSection>
    </div>
  );
}
