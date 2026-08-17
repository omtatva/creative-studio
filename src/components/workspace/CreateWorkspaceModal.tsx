"use client";

import { Modal } from "@/components/ui/Modal";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (workspaceId: string) => void;
}

/** Same CreateWorkspaceForm as the standalone page, in a modal — lets a page (e.g. Projects) offer workspace creation inline, then chain into whatever the user was originally trying to do, without navigating away. */
export function CreateWorkspaceModal({ isOpen, onClose, onCreated }: CreateWorkspaceModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create your workspace" className="max-w-md">
      <CreateWorkspaceForm
        submitLabel="Create workspace"
        onSuccess={(workspaceId) => {
          onCreated(workspaceId);
        }}
      />
    </Modal>
  );
}
