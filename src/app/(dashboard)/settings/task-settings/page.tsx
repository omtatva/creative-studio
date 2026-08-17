"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { OptionListEditor } from "@/components/settings/OptionListEditor";
import { TaskStatusListEditor } from "@/components/settings/TaskStatusListEditor";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { useToast } from "@/hooks/useToast";
import { COLOR_PALETTE } from "@/lib/constants/colorPalette";
import { DEFAULT_TASK_OPTIONS } from "@/lib/constants/taskOptions";
import { DEFAULT_TASK_DEFAULT_SETTINGS } from "@/lib/constants/settingsDefaults";
import { TaskOptionsSettings, TaskDefaultSettings, TaskPriorityOption, TaskLabelOption, TaskStatusOption } from "@/types/settings.types";

export default function TaskSettingsPage() {
  const { settings, isLoading, save } = useWorkspaceSettings();
  const { members } = useWorkspaceMembers();
  const toast = useToast();
  const [options, setOptions] = useState<TaskOptionsSettings>(DEFAULT_TASK_OPTIONS);
  const [defaults, setDefaults] = useState<TaskDefaultSettings>(DEFAULT_TASK_DEFAULT_SETTINGS);
  const [newTemplate, setNewTemplate] = useState({ name: "", defaultTitle: "", defaultDescription: "" });
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);

  useEffect(() => {
    if (settings) {
      setOptions(settings.taskOptions ?? DEFAULT_TASK_OPTIONS);
      setDefaults(settings.taskDefaults ?? DEFAULT_TASK_DEFAULT_SETTINGS);
    }
  }, [settings]);

  async function persistOptions(next: TaskOptionsSettings) {
    setOptions(next);
    try {
      await save({ taskOptions: next });
      toast.success("Task settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  async function persistDefaults(next: TaskDefaultSettings) {
    setDefaults(next);
    try {
      await save({ taskDefaults: next });
      toast.success("Task settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  function addTemplate() {
    if (!newTemplate.name.trim()) return;
    persistDefaults({
      ...defaults,
      templates: [...defaults.templates, { id: crypto.randomUUID(), ...newTemplate }],
    });
    setNewTemplate({ name: "", defaultTitle: "", defaultDescription: "" });
    setIsAddingTemplate(false);
  }

  if (isLoading) return <Loader label="Loading task settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Task Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Statuses, priorities, defaults, and templates for every task.</p>
      </div>

      <SettingsSection title="Custom statuses" description="Also used as the Kanban board's columns.">
        <TaskStatusListEditor
          items={options.statuses}
          colors={COLOR_PALETTE}
          onCreate={(status) => persistOptions({ ...options, statuses: [...options.statuses, { ...status, id: crypto.randomUUID() } as TaskStatusOption] })}
          onUpdate={(id, patch) => persistOptions({ ...options, statuses: options.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s)) })}
          onDelete={(id) => persistOptions({ ...options, statuses: options.statuses.filter((s) => s.id !== id) })}
        />
      </SettingsSection>

      <SettingsSection title="Custom priorities">
        <OptionListEditor<TaskPriorityOption>
          items={options.priorities}
          colors={COLOR_PALETTE}
          onCreate={(label, color) =>
            persistOptions({ ...options, priorities: [...options.priorities, { id: crypto.randomUUID(), label, color, order: options.priorities.length }] })
          }
          onUpdate={(id, patch) => persistOptions({ ...options, priorities: options.priorities.map((p) => (p.id === id ? { ...p, ...patch } : p)) })}
          onDelete={(id) => persistOptions({ ...options, priorities: options.priorities.filter((p) => p.id !== id) })}
        />
      </SettingsSection>

      <SettingsSection title="Labels">
        <OptionListEditor<TaskLabelOption>
          items={options.labels}
          colors={COLOR_PALETTE}
          minItems={0}
          onCreate={(label, color) => persistOptions({ ...options, labels: [...options.labels, { id: crypto.randomUUID(), label, color }] })}
          onUpdate={(id, patch) => persistOptions({ ...options, labels: options.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)) })}
          onDelete={(id) => persistOptions({ ...options, labels: options.labels.filter((l) => l.id !== id) })}
        />
      </SettingsSection>

      <SettingsSection title="Defaults">
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Default priority</label>
            <select
              value={defaults.defaultPriority}
              onChange={(e) => persistDefaults({ ...defaults, defaultPriority: e.target.value as TaskDefaultSettings["defaultPriority"] })}
              className="h-10 w-full max-w-xs rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <ToggleSwitch checked={defaults.autoAssignToCreator} onChange={(v) => persistDefaults({ ...defaults, autoAssignToCreator: v })} label="Auto-assign to creator" description="New tasks default to being assigned to whoever created them" />

          {!defaults.autoAssignToCreator && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Default assignee</label>
              <select
                value={defaults.defaultAssigneeUid ?? ""}
                onChange={(e) => persistDefaults({ ...defaults, defaultAssigneeUid: e.target.value || null })}
                className="h-10 w-full max-w-xs rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">None</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Task templates">
        <div className="flex flex-col gap-2">
          {defaults.templates.map((template) => (
            <div key={template.id} className="flex items-start gap-2.5 rounded-theme border border-border bg-surface px-2.5 py-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{template.name}</p>
                <p className="text-xs text-foreground-muted">{template.defaultTitle}</p>
              </div>
              <button
                onClick={() => persistDefaults({ ...defaults, templates: defaults.templates.filter((t) => t.id !== template.id) })}
                className="rounded-theme p-1.5 text-foreground-muted hover:bg-red-500/10 hover:text-red-500"
                aria-label="Delete template"
              >
                ×
              </button>
            </div>
          ))}

          {isAddingTemplate ? (
            <div className="flex flex-col gap-2 rounded-theme border border-primary bg-surface p-2.5">
              <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} placeholder="Template name" />
              <Input value={newTemplate.defaultTitle} onChange={(e) => setNewTemplate({ ...newTemplate, defaultTitle: e.target.value })} placeholder="Default task title" />
              <Textarea rows={2} value={newTemplate.defaultDescription} onChange={(e) => setNewTemplate({ ...newTemplate, defaultDescription: e.target.value })} placeholder="Default description" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsAddingTemplate(false)}>Cancel</Button>
                <Button size="sm" onClick={addTemplate} disabled={!newTemplate.name.trim()}>Add</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setIsAddingTemplate(true)} className="flex items-center justify-center gap-1.5 rounded-theme border border-dashed border-border py-2 text-xs font-medium text-foreground-muted hover:border-primary hover:text-primary">
              + Add template
            </button>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
