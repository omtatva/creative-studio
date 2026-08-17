"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "./RichTextEditor";
import { TaskAssigneePicker } from "./TaskAssigneePicker";
import { TaskLabelPicker } from "./TaskLabelPicker";
import { TagsInput } from "@/components/projects/TagsInput";
import { taskFormSchema, type TaskFormValues } from "@/lib/validations/task.schema";
import { useTaskOptions } from "@/hooks/useTaskOptions";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { getProject } from "@/services/projectService";
import { Task, TaskActor } from "@/types/task.types";

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: Task | null;
  projectId?: string; // when set, the project field is locked (opened from within a project's Tasks tab)
  initialTitle?: string; // prefills the title on a NEW task (e.g. "Create task" from a Creative Workspace asset) — ignored when editing
  initialDescriptionHtml?: string; // prefills the description on a NEW task (e.g. quoting the source review comment) — ignored when editing
  onSubmit: (values: TaskFormValues & { projectId: string; assignee: TaskActor | null }) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Drives both task creation and editing. When opened from a
 * project's own Tasks tab, `projectId` is passed in and the project
 * selector is hidden; opened from the global /tasks page, the user
 * picks a project first, which loads that project's member list for
 * the assignee picker and comment @mentions.
 */
export function TaskFormModal({ isOpen, onClose, task, projectId, initialTitle, initialDescriptionHtml, onSubmit, isSubmitting }: TaskFormModalProps) {
  const { workspaceId } = useWorkspaceContext();
  const { options, isLoading: isLoadingOptions } = useTaskOptions();
  const { allProjectsForCounts: allProjects } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? task?.projectId ?? "");
  const [assignee, setAssignee] = useState<TaskActor | null>(task?.assignee ?? null);
  const [projectMembers, setProjectMembers] = useState<TaskActor[]>([]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      descriptionHtml: "",
      assigneeUid: null,
      statusId: options.statuses[0]?.id ?? "",
      priorityId: options.priorities[0]?.id ?? "",
      startDate: null,
      dueDate: null,
      estimatedMinutes: null,
      tags: [],
      labelIds: [],
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelectedProjectId(projectId ?? task?.projectId ?? "");
    setAssignee(task?.assignee ?? null);
    reset({
      title: task?.title ?? initialTitle ?? "",
      descriptionHtml: task?.descriptionHtml ?? initialDescriptionHtml ?? "",
      assigneeUid: task?.assignee?.uid ?? null,
      statusId: task?.statusId ?? options.statuses[0]?.id ?? "",
      priorityId: task?.priorityId ?? options.priorities[0]?.id ?? "",
      startDate: task?.startDate ?? null,
      dueDate: task?.dueDate ?? null,
      estimatedMinutes: task?.estimatedMinutes ?? null,
      tags: task?.tags ?? [],
      labelIds: task?.labelIds ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task, options]);

  useEffect(() => {
    if (!selectedProjectId || !workspaceId) {
      setProjectMembers([]);
      return;
    }
    getProject(workspaceId, selectedProjectId).then((project) => {
      setProjectMembers(
        project ? project.members.map((m) => ({ uid: m.uid, displayName: m.displayName, photoURL: m.photoURL, email: m.email })) : []
      );
    });
  }, [selectedProjectId, workspaceId]);

  async function onFormSubmit(values: TaskFormValues) {
    if (!selectedProjectId) return;
    await onSubmit({ ...values, assignee, projectId: selectedProjectId });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task ? "Edit task" : "New task"} className="max-w-lg">
      {isLoadingOptions ? (
        <div className="py-10 text-center text-sm text-foreground-muted">Loading options...</div>
      ) : (
        <form className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit(onFormSubmit)}>
          {!projectId && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={Boolean(task)}
                className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
              >
                <option value="">Select a project...</option>
                {allProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <Input label="Task title" placeholder="Design the new landing page hero" error={errors.title?.message} {...register("title")} />

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Description</p>
            <Controller
              control={control}
              name="descriptionHtml"
              render={({ field }) => <RichTextEditor value={field.value ?? ""} onChange={field.onChange} placeholder="Add more detail..." />}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Assignee</p>
            <TaskAssigneePicker value={assignee} candidates={projectMembers} onChange={setAssignee} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
              <Controller
                control={control}
                name="statusId"
                render={({ field }) => (
                  <select {...field} className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {options.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                )}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Priority</label>
              <Controller
                control={control}
                name="priorityId"
                render={({ field }) => (
                  <select {...field} className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {options.priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Controller control={control} name="startDate" render={({ field }) => (
              <Input label="Start date" type="date" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />
            )} />
            <Controller control={control} name="dueDate" render={({ field }) => (
              <Input label="Due date" type="date" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} error={errors.dueDate?.message} />
            )} />
          </div>

          <Controller control={control} name="estimatedMinutes" render={({ field }) => (
            <Input
              label="Estimated time (hours)"
              type="number"
              min={0}
              step={0.5}
              value={field.value ? field.value / 60 : ""}
              onChange={(e) => field.onChange(e.target.value ? Math.round(parseFloat(e.target.value) * 60) : null)}
              placeholder="e.g. 4"
            />
          )} />

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Labels</p>
            <Controller control={control} name="labelIds" render={({ field }) => (
              <TaskLabelPicker labels={options.labels} value={field.value} onChange={field.onChange} />
            )} />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Tags</p>
            <Controller control={control} name="tags" render={({ field }) => (
              <TagsInput value={field.value} onChange={field.onChange} placeholder="press Enter to add" />
            )} />
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting} disabled={!selectedProjectId}>
              {task ? "Save changes" : "Create task"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
