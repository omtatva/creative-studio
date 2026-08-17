"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { inviteUserSchema, type InviteUserFormValues } from "@/lib/validations/settings.schema";

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (values: InviteUserFormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function InviteUserModal({ isOpen, onClose, onInvite, isSubmitting }: InviteUserModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteUserFormValues>({ resolver: zodResolver(inviteUserSchema), defaultValues: { role: "member" } });

  async function onSubmit(values: InviteUserFormValues) {
    await onInvite(values);
    reset({ email: "", role: "member" });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite a user">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Email" type="email" placeholder="teammate@company.com" error={errors.email?.message} {...register("email")} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
          <select {...register("role")} className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>{isSubmitting ? "Sending Invitation..." : "Send Invitation"}</Button>
        </div>
      </form>
    </Modal>
  );
}
