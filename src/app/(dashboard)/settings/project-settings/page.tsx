"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { OptionListEditor } from "@/components/settings/OptionListEditor";
import { TemplateListEditor } from "@/components/settings/TemplateListEditor";
import { StringListEditor } from "@/components/settings/StringListEditor";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { COLOR_PALETTE } from "@/lib/constants/colorPalette";
import { DEFAULT_PROJECT_OPTIONS } from "@/lib/constants/projectOptions";
import { DEFAULT_PROJECT_DEFAULT_SETTINGS } from "@/lib/constants/settingsDefaults";
import { ProjectOptionsSettings, ProjectDefaultSettings, ProjectStatusOption, ProjectPriorityOption } from "@/types/settings.types";

/**
 * Every change here saves immediately (no separate "Save" button) —
 * status/priority/template/folder edits are each a small, self-
 * contained action, matching the interaction model OptionListEditor/
 * TemplateListEditor/StringListEditor already use elsewhere.
 */
export default function ProjectSettingsPage() {
  const { settings, isLoading, save } = useWorkspaceSettings();
  const toast = useToast();
  const [options, setOptions] = useState<ProjectOptionsSettings>(DEFAULT_PROJECT_OPTIONS);
  const [defaults, setDefaults] = useState<ProjectDefaultSettings>(DEFAULT_PROJECT_DEFAULT_SETTINGS);

  useEffect(() => {
    if (settings) {
      setOptions(settings.projectOptions ?? DEFAULT_PROJECT_OPTIONS);
      setDefaults(settings.projectDefaults ?? DEFAULT_PROJECT_DEFAULT_SETTINGS);
    }
  }, [settings]);

  async function persistOptions(next: ProjectOptionsSettings) {
    setOptions(next);
    try {
      await save({ projectOptions: next });
      toast.success("Project settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  async function persistDefaults(next: ProjectDefaultSettings) {
    setDefaults(next);
    try {
      await save({ projectDefaults: next });
      toast.success("Project settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  if (isLoading) return <Loader label="Loading project settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Project Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Statuses, priorities, templates, and default structure for every project.</p>
      </div>

      <SettingsSection title="Custom project statuses">
        <OptionListEditor<ProjectStatusOption>
          items={options.statuses}
          colors={COLOR_PALETTE}
          onCreate={(label, color) => persistOptions({ ...options, statuses: [...options.statuses, { id: crypto.randomUUID(), label, color }] })}
          onUpdate={(id, patch) => persistOptions({ ...options, statuses: options.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s)) })}
          onDelete={(id) => persistOptions({ ...options, statuses: options.statuses.filter((s) => s.id !== id) })}
        />
      </SettingsSection>

      <SettingsSection title="Custom priorities">
        <OptionListEditor<ProjectPriorityOption>
          items={options.priorities}
          colors={COLOR_PALETTE}
          onCreate={(label, color) =>
            persistOptions({ ...options, priorities: [...options.priorities, { id: crypto.randomUUID(), label, color, order: options.priorities.length }] })
          }
          onUpdate={(id, patch) => persistOptions({ ...options, priorities: options.priorities.map((p) => (p.id === id ? { ...p, ...patch } : p)) })}
          onDelete={(id) => persistOptions({ ...options, priorities: options.priorities.filter((p) => p.id !== id) })}
        />
      </SettingsSection>

      <SettingsSection title="Project templates" description="Quick-start descriptions members can reference when creating a project.">
        <TemplateListEditor
          items={defaults.templates}
          onCreate={(name, description) => persistDefaults({ ...defaults, templates: [...defaults.templates, { id: crypto.randomUUID(), name, description }] })}
          onDelete={(id) => persistDefaults({ ...defaults, templates: defaults.templates.filter((t) => t.id !== id) })}
        />
      </SettingsSection>

      <SettingsSection title="Default folder structure" description="Suggested folders for organizing a new project's files.">
        <StringListEditor items={defaults.defaultFolderStructure} onChange={(items) => persistDefaults({ ...defaults, defaultFolderStructure: items })} placeholder="Folder name..." />
      </SettingsSection>

      <SettingsSection title="Approval">
        <ToggleSwitch
          checked={defaults.requireApprovalToClose}
          onChange={(v) => persistDefaults({ ...defaults, requireApprovalToClose: v })}
          label="Require approval to close a project"
          description="Projects can't be marked complete without an approved review"
        />
      </SettingsSection>
    </div>
  );
}
