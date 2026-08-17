"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { StringListEditor } from "@/components/settings/StringListEditor";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_REVIEW_DEFAULT_SETTINGS } from "@/lib/constants/settingsDefaults";
import { ReviewDefaultSettings, ApprovalWorkflow } from "@/types/settings.types";

const WORKFLOWS: { value: ApprovalWorkflow; label: string; description: string }[] = [
  { value: "single_approver", label: "Single approver", description: "One person approves or requests changes" },
  { value: "multi_stage", label: "Multi-stage", description: "Review moves through ordered stages before final approval" },
];

export default function ReviewSettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<ReviewDefaultSettings>(DEFAULT_REVIEW_DEFAULT_SETTINGS);

  useEffect(() => {
    if (settings) setDraft(settings.reviewDefaults ?? DEFAULT_REVIEW_DEFAULT_SETTINGS);
  }, [settings]);

  async function handleSave() {
    if (draft.roundsIncluded < 1) {
      toast.error("Included rounds must be at least 1");
      return;
    }
    try {
      await save({ reviewDefaults: draft });
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
        <p className="mt-1 text-sm text-foreground-muted">Approval workflow, comment rules, and review stages.</p>
      </div>

      <SettingsSection
        title="Approval workflow"
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving}>Save changes</Button>}
      >
        <div className="flex flex-col gap-2">
          {WORKFLOWS.map((workflow) => (
            <button
              key={workflow.value}
              onClick={() => setDraft({ ...draft, approvalWorkflow: workflow.value })}
              className={`flex flex-col items-start gap-0.5 rounded-theme border px-3 py-2.5 text-left ${draft.approvalWorkflow === workflow.value ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"}`}
            >
              <span className="text-sm font-medium text-foreground">{workflow.label}</span>
              <span className="text-xs text-foreground-muted">{workflow.description}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Client approval">
        <div className="flex flex-col gap-4">
          <ToggleSwitch checked={draft.requireClientApproval} onChange={(v) => setDraft({ ...draft, requireClientApproval: v })} label="Require client approval" description="Reviews aren't complete until a client explicitly approves" />
          <Input
            label="Rounds included"
            type="number"
            min={1}
            value={draft.roundsIncluded}
            onChange={(e) => setDraft({ ...draft, roundsIncluded: Number(e.target.value) })}
            hint="Number of review rounds included before extra rounds are flagged"
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Comment rules">
        <div className="flex flex-col gap-4">
          <ToggleSwitch checked={draft.allowComments} onChange={(v) => setDraft({ ...draft, allowComments: v })} label="Allow comments on reviews" />
          <ToggleSwitch
            checked={draft.requireCommentOnChangesRequested}
            onChange={(v) => setDraft({ ...draft, requireCommentOnChangesRequested: v })}
            label="Require a comment when requesting changes"
            description="Reviewers must explain what needs to change"
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Default review stages" description="Applied in order to new review requests.">
        <StringListEditor items={draft.defaultStages} onChange={(stages) => setDraft({ ...draft, defaultStages: stages })} placeholder="Stage name..." />
      </SettingsSection>
    </div>
  );
}
