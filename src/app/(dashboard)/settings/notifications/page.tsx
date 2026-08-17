"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/constants/settingsDefaults";
import { NotificationSettings } from "@/types/settings.types";

const DIGEST_OPTIONS: { value: NotificationSettings["digestFrequency"]; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const PREFERENCE_LABELS: { key: keyof NotificationSettings["preferences"]; label: string; description: string }[] = [
  { key: "taskAssigned", label: "Task assigned", description: "When someone assigns you a task" },
  { key: "reviewUpdates", label: "Review updates", description: "When a review is approved or sent back" },
  { key: "comments", label: "Comments", description: "New comments on tasks you're involved in" },
  { key: "mentions", label: "Mentions", description: "When someone @mentions you" },
];

export default function NotificationsSettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS);
  }, [settings]);

  async function handleSave() {
    if (draft.slackEnabled && draft.slackWebhookUrl && !/^https:\/\/hooks\.slack\.com\/.+/.test(draft.slackWebhookUrl)) {
      setWebhookError("Must be a Slack webhook URL (https://hooks.slack.com/...)");
      return;
    }
    setWebhookError(null);
    try {
      await save({ notifications: draft });
      toast.success("Notification settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    }
  }

  if (isLoading) return <Loader label="Loading notifications..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-foreground-muted">Choose how your workspace gets notified.</p>
      </div>

      <SettingsSection
        title="Channels"
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving}>Save changes</Button>}
      >
        <div className="flex flex-col gap-4">
          <ToggleSwitch checked={draft.emailEnabled} onChange={(v) => setDraft({ ...draft, emailEnabled: v })} label="Email notifications" description="Send notifications to members' email" />
          <ToggleSwitch checked={draft.inAppEnabled} onChange={(v) => setDraft({ ...draft, inAppEnabled: v })} label="In-app notifications" description="Show notifications in the bell menu" />
          <ToggleSwitch checked={draft.slackEnabled} onChange={(v) => setDraft({ ...draft, slackEnabled: v })} label="Slack notifications" description="Post notifications to a Slack channel" />
          {draft.slackEnabled && (
            <Input
              label="Slack webhook URL"
              placeholder="https://hooks.slack.com/services/..."
              value={draft.slackWebhookUrl ?? ""}
              onChange={(e) => setDraft({ ...draft, slackWebhookUrl: e.target.value })}
              error={webhookError ?? undefined}
            />
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Digest frequency">
        <div className="flex gap-2">
          {DIGEST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDraft({ ...draft, digestFrequency: opt.value })}
              className={`rounded-theme border px-3 py-1.5 text-sm font-medium ${draft.digestFrequency === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground-muted hover:bg-surface-muted"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Notification preferences" description="What triggers a notification.">
        <div className="flex flex-col gap-4">
          {PREFERENCE_LABELS.map(({ key, label, description }) => (
            <ToggleSwitch
              key={key}
              checked={draft.preferences[key]}
              onChange={(v) => setDraft({ ...draft, preferences: { ...draft.preferences, [key]: v } })}
              label={label}
              description={description}
            />
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
