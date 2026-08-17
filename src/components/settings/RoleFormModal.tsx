"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { PERMISSION_CATALOG } from "@/lib/constants/permissions";
import { customRoleSchema, type CustomRoleFormValues } from "@/lib/validations/settings.schema";
import { CustomRole } from "@/types/workspace.types";

interface RoleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  role?: CustomRole | null;
  onSubmit: (values: CustomRoleFormValues) => Promise<void>;
  isSubmitting: boolean;
}

const GROUPS = Array.from(new Set(PERMISSION_CATALOG.map((p) => p.module)));

export function RoleFormModal({ isOpen, onClose, role, onSubmit, isSubmitting }: RoleFormModalProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CustomRoleFormValues>({ resolver: zodResolver(customRoleSchema), defaultValues: { name: "", description: "", permissions: [] } });

  useEffect(() => {
    if (!isOpen) return;
    reset({ name: role?.name ?? "", description: role?.description ?? "", permissions: role?.permissions ?? [] });
  }, [isOpen, role, reset]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={role ? "Edit role" : "New custom role"} className="max-w-lg">
      <form className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Role name" placeholder="e.g. Client Reviewer" error={errors.name?.message} {...register("name")} />
        <Textarea label="Description" rows={2} placeholder="What can this role do?" {...register("description")} />

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Permissions</p>
          {errors.permissions && <p className="mb-1.5 text-xs text-red-500">{errors.permissions.message}</p>}
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => (
              <div className="flex flex-col gap-3">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{group}</p>
                    <div className="flex flex-col gap-1">
                      {PERMISSION_CATALOG.filter((p) => p.module === group).map((perm) => (
                        <label key={perm.key} className="flex items-center gap-2.5 rounded-theme px-2 py-1.5 text-sm hover:bg-surface-muted">
                          <input
                            type="checkbox"
                            checked={field.value.includes(perm.key)}
                            onChange={() =>
                              field.onChange(field.value.includes(perm.key) ? field.value.filter((k) => k !== perm.key) : [...field.value, perm.key])
                            }
                            className="accent-primary"
                          />
                          {perm.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>{role ? "Save changes" : "Create role"}</Button>
        </div>
      </form>
    </Modal>
  );
}
