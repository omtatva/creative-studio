"use client";

import { useState } from "react";
import { Download, Copy, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ProjectColorPicker } from "@/components/projects/ProjectColorPicker";
import { ProjectIconPicker } from "@/components/projects/ProjectIconPicker";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { useProjectActions } from "@/hooks/useProjectActions";
import { useToast } from "@/hooks/useToast";
import { exportProjectAsJson } from "@/lib/utils/exportProject";

/**
 * Inline (non-modal) settings form — same fields as ProjectFormModal
 * minus cover/status/priority/dates, which stay in the modal since
 * they're used from the list view too. Plus the destructive/utility
 * actions the spec calls out explicitly: Archive, Delete, Duplicate,
 * Export.
 */
export function ProjectSettingsTab() {
  const { project, options } = useProjectDetailsContext();
  const actions = useProjectActions();
  const toast = useToast();

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "");
  const [icon, setIcon] = useState(project?.icon ?? "");
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  if (!project) return null;

  const isDirty = name !== project.name || description !== project.description || color !== project.color || icon !== project.icon;

  async function handleSave() {
    const result = await actions.update(project!.id, { name, description, color, icon });
    if (result.error === null) toast.success("Project updated");
    else toast.error(result.error ?? "Couldn't save changes. Please try again.");
  }

  async function handleDuplicate() {
    const result = await actions.duplicate(project!.id);
    if (result.error === null) toast.success(`Duplicated "${project!.name}"`);
    else toast.error(result.error ?? "Couldn't duplicate project. Please try again.");
  }

  async function handleRestore() {
    const result = await actions.restore(project!.id);
    if (result.error === null) toast.success("Project restored");
    else toast.error(result.error ?? "Couldn't restore project. Please try again.");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Color</p>
            <ProjectColorPicker colors={options.colors} value={color} onChange={setColor} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Icon</p>
            <ProjectIconPicker icons={options.icons} value={icon} color={color} onChange={setIcon} />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!isDirty} isLoading={actions.isSubmitting}>
              Save changes
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project actions</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-2">
          <ActionRow
            icon={Copy}
            label="Duplicate project"
            description="Create a copy of this project, owned by you."
            action={<Button variant="outline" size="sm" onClick={handleDuplicate}>Duplicate</Button>}
          />
          <ActionRow
            icon={Download}
            label="Export project"
            description="Download this project's data as a JSON file."
            action={<Button variant="outline" size="sm" onClick={() => exportProjectAsJson(project)}>Export</Button>}
          />
          {project.isArchived ? (
            <ActionRow
              icon={ArchiveRestore}
              label="Restore project"
              description="Move this project back into your active list."
              action={<Button variant="outline" size="sm" onClick={handleRestore}>Restore</Button>}
            />
          ) : (
            <ActionRow
              icon={Archive}
              label="Archive project"
              description="Hide this project from your active list. You can restore it anytime."
              action={<Button variant="outline" size="sm" onClick={() => setIsArchiveOpen(true)}>Archive</Button>}
            />
          )}
          <ActionRow
            icon={Trash2}
            label="Delete project"
            description="Permanently delete this project. This cannot be undone."
            danger
            action={<Button variant="danger" size="sm" onClick={() => setIsDeleteOpen(true)}>Delete</Button>}
          />
        </div>
      </Card>

      <ConfirmModal
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        onConfirm={async () => {
          const result = await actions.archive(project.id);
          if (result.error === null) toast.success("Project archived");
          else toast.error(result.error ?? "Couldn't archive project. Please try again.");
          setIsArchiveOpen(false);
        }}
        title="Archive project?"
        description={`"${project.name}" will move to the Archive section. You can restore it anytime.`}
        confirmLabel="Archive"
        isSubmitting={actions.isSubmitting}
      />

      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={async () => {
          const result = await actions.remove(project.id, true);
          if (result.error === null) toast.success("Project deleted");
          else toast.error(result.error ?? "Couldn't delete project. Please try again.");
          setIsDeleteOpen(false);
        }}
        title="Delete project?"
        description={`This permanently deletes "${project.name}" and its cover image. This can't be undone.`}
        confirmLabel="Delete"
        isDanger
        isSubmitting={actions.isSubmitting}
      />
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  description,
  action,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  action: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-theme border border-border p-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-theme ${danger ? "bg-red-500/10 text-red-500" : "bg-surface-muted text-foreground-muted"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-foreground-muted">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
