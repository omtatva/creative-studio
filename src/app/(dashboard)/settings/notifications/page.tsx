"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/constants/settingsDefaults";
import { NotificationSettings } from "@/types/settings.types";

/**
 * Notifications. The in-app switch and the two triggers below are applied by the server where in-app notifications are created
 * (lib/server/notifications.ts), so they genuinely change what members receive. Email, Slack, digests, comment and mention
 * notifications have no delivery system behind them yet, so they are listed as unavailable instead of offered as switches.
 */
export default function NotificationsSettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const toast = useToast();
  const [inApp, setInApp] = useState(true);
  const [taskAssigned, setTaskAssigned] = useState(true);
  const [reviewUpdates, setReviewUpdates] = useState(true);

  const saved: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(settings?.notifications ?? {}), preferences: { ...DEFAULT_NOTIFICATION_SETTINGS.preferences, ...(settings?.notifications?.preferences ?? {}) } };

  useEffect(() => {
    if (!settings) return;
    setInApp(saved.inAppEnabled);
    setTaskAssigned(saved.preferences.taskAssigned);
    setReviewUpdates(saved.preferences.reviewUpdates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const dirty = inApp !== saved.inAppEnabled || taskAssigned !== saved.preferences.taskAssigned || reviewUpdates !== saved.preferences.reviewUpdates;

  async function handleSave() {
    try {
      // Only the three working values change; everything else already stored is carried over untouched.
      await save({ notifications: { ...saved, inAppEnabled: inApp, preferences: { ...saved.preferences, taskAssigned, reviewUpdates } } });
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
        <p className="mt-1 text-sm text-foreground-muted">Choose which in-app notifications your workspace sends.</p>
      </div>

      <SettingsSection
        title="In-app notifications"
        description="Shown in the bell menu and on the Notifications page."
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving} disabled={!dirty}>Save changes</Button>}
      >
        <div className="flex flex-col gap-4">
          <ToggleSwitch checked={inApp} onChange={setInApp} label="Send in-app notifications" description="Turn off to stop creating notifications for everyone in this workspace" />
          <ToggleSwitch checked={taskAssigned} onChange={setTaskAssigned} disabled={!inApp} label="Task assigned" description="When someone is assigned a task" />
          <ToggleSwitch checked={reviewUpdates} onChange={setReviewUpdates} disabled={!inApp} label="Review updates" description="When a review round is requested or decided" />
        </div>
      </SettingsSection>

      <SettingsSection title="Not available yet" description="These have no delivery system behind them, so there is nothing to switch on.">
        <p className="text-sm text-foreground-muted">Email notifications, Slack notifications, daily/weekly digests, and comment and @mention notifications.</p>
      </SettingsSection>
    </div>
  );
}
