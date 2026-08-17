"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { ProjectColorPicker } from "./ProjectColorPicker";
import { ProjectIconPicker } from "./ProjectIconPicker";
import { ProjectCoverUpload } from "./ProjectCoverUpload";
import { TagsInput } from "./TagsInput";
import { projectFormSchema, type ProjectFormValues } from "@/lib/validations/project.schema";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { Project } from "@/types/project.types";

interface ProjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
  onSubmit: (values: ProjectFormValues & { coverImageFile: File | null }) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Single modal drives BOTH create and edit — pass `project` to
 * prefill for editing, omit it to create. Statuses/priorities/
 * colors/icons all come from `useProjectOptions()`, so this form
 * never needs updating when Settings adds/removes an option.
 */
export function ProjectFormModal({ isOpen, onClose, project, onSubmit, isSubmitting }: ProjectFormModalProps) {
  const { options, isLoading: isLoadingOptions } = useProjectOptions();
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      color: options.colors[0],
      icon: options.icons[0],
      statusId: options.statuses[0]?.id ?? "",
      priorityId: options.priorities[0]?.id ?? "",
      startDate: null,
      dueDate: null,
      tags: [],
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    reset({
      name: project?.name ?? "",
      description: project?.description ?? "",
      color: project?.color ?? options.colors[0],
      icon: project?.icon ?? options.icons[0],
      statusId: project?.statusId ?? options.statuses[0]?.id ?? "",
      priorityId: project?.priorityId ?? options.priorities[0]?.id ?? "",
      startDate: project?.startDate ?? null,
      dueDate: project?.dueDate ?? null,
      tags: project?.tags ?? [],
    });
    setCoverFile(null);
    setCoverPreview(project?.coverImageUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, project, options]);

  function handleCoverSelect(file: File | null) {
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onFormSubmit(values: ProjectFormValues) {
    await onSubmit({ ...values, coverImageFile: coverFile });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={project ? "Edit project" : "New project"} className="max-w-lg">
      {isLoadingOptions ? (
        <div className="py-10 text-center text-sm text-foreground-muted">Loading options...</div>
      ) : (
        <form className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit(onFormSubmit)}>
          <ProjectCoverUpload previewUrl={coverPreview} onSelect={handleCoverSelect} />

          <Input label="Project name" placeholder="Brand refresh campaign" error={errors.name?.message} {...register("name")} />
          <Textarea label="Description" rows={3} placeholder="What's this project about?" error={errors.description?.message} {...register("description")} />

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Color</p>
            <Controller
              control={control}
              name="color"
              render={({ field }) => <ProjectColorPicker colors={options.colors} value={field.value} onChange={field.onChange} />}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Icon</p>
            <Controller
              control={control}
              name="icon"
              render={({ field }) => (
                <ProjectIconPicker icons={options.icons} value={field.value} color={watch("color")} onChange={field.onChange} />
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
              <Controller
                control={control}
                name="statusId"
                render={({ field }) => (
                  <select
                    {...field}
                    className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {options.statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
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
                  <select
                    {...field}
                    className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {options.priorities.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <Input
                  label="Start date"
                  type="date"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              )}
            />
            <Controller
              control={control}
              name="dueDate"
              render={({ field }) => (
                <Input
                  label="Due date"
                  type="date"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  error={errors.dueDate?.message}
                />
              )}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Tags</p>
            <Controller
              control={control}
              name="tags"
              render={({ field }) => <TagsInput value={field.value} onChange={field.onChange} placeholder="press Enter to add" />}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {project ? "Save changes" : "Create project"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
