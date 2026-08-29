"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { MemberRole, Workspace } from "@/types/workspace.types";

export interface SuperAdminInviteValues {
  workspaceId: string;
  email: string;
  role: Exclude<MemberRole, "owner">;
}

interface SuperAdminInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  onInvite: (values: SuperAdminInviteValues) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Super Admin > Users' invite flow — the same email/role invite as
 * Settings > Users' InviteUserModal, plus a workspace picker (Super
 * Admin isn't scoped to one workspace, so it has to choose which
 * customer's workspace to add the invite to). Support use case: "this
 * customer asked us to add a teammate." Reuses the exact same
 * createInvite/sendInviteEmail service functions, not a separate
 * invite system.
 */
export function SuperAdminInviteModal({ isOpen, onClose, workspaces, onInvite, isSubmitting }: SuperAdminInviteModalProps) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<MemberRole, "owner">>("member");

  function handleClose() {
    onClose();
    setWorkspaceId("");
    setEmail("");
    setRole("member");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !email.trim()) return;
    await onInvite({ workspaceId, email: email.trim(), role });
    setEmail("");
    setRole("member");
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Invite a user">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Workspace</label>
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            required
            className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="" disabled>
              Select a workspace...
            </option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <Input label="Email" type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Exclude<MemberRole, "owner">)}
            className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!workspaceId || !email.trim()}>
            {isSubmitting ? "Sending Invitation..." : "Send Invitation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
