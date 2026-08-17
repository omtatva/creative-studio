"use client";

import { useState } from "react";
import { Calendar, Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { ProjectPriorityBadge } from "@/components/projects/ProjectPriorityBadge";
import { ProjectMembersAvatarGroup } from "@/components/projects/ProjectMembersAvatarGroup";
import { ProjectQuickActionsMenu } from "@/components/projects/ProjectQuickActionsMenu";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { getProjectIcon } from "@/lib/constants/projectIconMap";
import { formatDate } from "@/lib/utils/date";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { useProjectActions } from "@/hooks/useProjectActions";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { ProjectFormValues } from "@/lib/validations/project.schema";

/** Cover + identity + quick actions for a single project. Shared by every tab via the [projectId] layout. */
export function ProjectDetailsHeader() {
  const { project, options } = useProjectDetailsContext();
  const { firebaseUser } = useAuthContext();
  const actions = useProjectActions();
  const toast = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  if (!project) return null;

  const uid = firebaseUser?.uid ?? "";
  const Icon = getProjectIcon(project.icon);
  const status = options.statuses.find((s) => s.id === project.statusId);
  const priority = options.priorities.find((p) => p.id === project.priorityId);

  async function handleFormSubmit(values: ProjectFormValues & { coverImageFile: File | null }) {
    const result = await actions.update(project!.id, {
      name: values.name,
      description: values.description,
      color: values.color,
      icon: values.icon,
      statusId: values.statusId,
      priorityId: values.priorityId,
      startDate: values.startDate,
      dueDate: values.dueDate,
      tags: values.tags,
    });
    if (result.error === null) {
      toast.success("Project updated");
      setIsFormOpen(false);
    } else {
      toast.error(result.error ?? "Couldn't update project. Please try again.");
    }
  }

  return (
    <>
      <Card noPadding className="overflow-hidden">
        <div
          className="relative h-20 w-full sm:h-24"
          style={
            project.coverImageUrl
              ? { backgroundImage: `url(${project.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: `linear-gradient(135deg, rgb(${project.color} / 0.9), rgb(${project.color} / 0.45))` }
          }
        >
          <div className="absolute right-3 top-3">
            <ProjectQuickActionsMenu
              project={project}
              currentUid={uid}
              onEdit={() => setIsFormOpen(true)}
              onDuplicate={async () => {
                const result = await actions.duplicate(project.id);
                if (result.error === null) toast.success(`Duplicated "${project.name}"`);
                else toast.error(result.error ?? "Couldn't duplicate project. Please try again.");
              }}
              onArchive={() => setIsArchiveOpen(true)}
              onRestore={async () => {
                const result = await actions.restore(project.id);
                if (result.error === null) toast.success("Project restored");
                else toast.error(result.error ?? "Couldn't restore project. Please try again.");
              }}
              onDelete={() => setIsDeleteOpen(true)}
              onToggleFavorite={async () => {
                const result = await actions.toggleFavorite(project.id, project.favoritedBy.includes(uid));
                if (result.error !== null) toast.error(result.error ?? "Couldn't update favorite. Please try again.");
              }}
              onTogglePinned={async () => {
                const result = await actions.togglePinned(project.id, project.pinnedBy.includes(uid));
                if (result.error !== null) toast.error(result.error ?? "Couldn't update pin. Please try again.");
              }}
            />
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-theme border-4 border-surface bg-surface shadow-soft"
                style={{ backgroundColor: `rgb(${project.color} / 0.12)` }}
              >
                <Icon className="h-6 w-6" style={{ color: `rgb(${project.color})` }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-foreground">{project.name}</h1>
                  <button
                    onClick={() => setIsFormOpen(true)}
                    className="rounded-theme p-1 text-foreground-muted hover:bg-surface-muted"
                    aria-label="Edit project"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-0.5 max-w-xl text-sm text-foreground-muted">
                  {project.description || "No description yet."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ProjectStatusBadge status={status} />
                  <ProjectPriorityBadge priority={priority} />
                  {project.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground-muted">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <ProjectMembersAvatarGroup members={project.members} max={5} />
              {project.dueDate && (
                <span className="flex items-center gap-1 text-xs text-foreground-muted">
                  <Calendar className="h-3.5 w-3.5" />
                  Due {formatDate(project.dueDate)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-foreground-muted">
              <span>Progress</span>
              <span>{project.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${project.progress}%`, backgroundColor: `rgb(${project.color})` }}
              />
            </div>
          </div>
        </div>
      </Card>

      <ProjectFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        project={project}
        onSubmit={handleFormSubmit}
        isSubmitting={actions.isSubmitting}
      />

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
    </>
  );
}
