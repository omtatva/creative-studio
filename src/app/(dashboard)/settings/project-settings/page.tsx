"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { OptionListEditor } from "@/components/settings/OptionListEditor";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useToast } from "@/hooks/useToast";
import { COLOR_PALETTE } from "@/lib/constants/colorPalette";
import { DEFAULT_PROJECT_OPTIONS } from "@/lib/constants/projectOptions";
import { ProjectOptionsSettings, ProjectStatusOption, ProjectPriorityOption } from "@/types/settings.types";

/**
 * Every change here saves immediately (no separate "Save" button) —
 * status/priority edits are each a small, self-
 * contained action, matching the interaction model OptionListEditor/
 * already uses elsewhere.
 */
export default function ProjectSettingsPage() {
  const { settings, isLoading, save } = useWorkspaceSettings();
  const toast = useToast();
  const [options, setOptions] = useState<ProjectOptionsSettings>(DEFAULT_PROJECT_OPTIONS);

  useEffect(() => {
    if (settings) {
      setOptions(settings.projectOptions ?? DEFAULT_PROJECT_OPTIONS);
    }
  }, [settings]);

  async function persistOptions(next: ProjectOptionsSettings) {
    setOptions(next);
    try {
      await save({ projectOptions: next });
      toast.success("Project settings saved");
    } catch (err) {
      setOptions(settings?.projectOptions ?? DEFAULT_PROJECT_OPTIONS); // not saved — show what is really stored
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  if (isLoading) return <Loader label="Loading project settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Project Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Statuses and priorities used by every project in this workspace.</p>
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
    </div>
  );
}
