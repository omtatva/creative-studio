"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_REVIEW_DEFAULT_SETTINGS } from "@/lib/constants/settingsDefaults";

/**
 * Review settings. The one rule that is enforced is "require a note when requesting changes" — /api/review-rounds refuses a
 * changes-requested decision without a note when it is on. The older approval-workflow, client-approval, rounds-included, comment and default-stage
 * options were saved but never read by the review system, so they are no longer offered here; how a review round is run is decided per round
 * (reviewers, required/optional) from the review panel.
 */
export default function ReviewSettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const toast = useToast();
  const savedValue = settings?.reviewDefaults?.requireCommentOnChangesRequested ?? DEFAULT_REVIEW_DEFAULT_SETTINGS.requireCommentOnChangesRequested;
  const [requireNote, setRequireNote] = useState(savedValue);

  useEffect(() => {
    if (settings) setRequireNote(savedValue);
  }, [settings, savedValue]);

  async function handleSave() {
    try {
      await save({ reviewDefaults: { ...DEFAULT_REVIEW_DEFAULT_SETTINGS, ...(settings?.reviewDefaults ?? {}), requireCommentOnChangesRequested: requireNote } });
      toast.success("Review settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    }
  }

  if (isLoading) return <Loader label="Loading review settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Review Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Rules applied to every review round in this workspace.</p>
      </div>

      <SettingsSection
        title="Requesting changes"
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving} disabled={requireNote === savedValue}>Save changes</Button>}
      >
        <ToggleSwitch
          checked={requireNote}
          onChange={setRequireNote}
          label="Require a note when requesting changes"
          description="Reviewers must explain what needs to change before they can send a review back"
        />
      </SettingsSection>
    </div>
  );
}
