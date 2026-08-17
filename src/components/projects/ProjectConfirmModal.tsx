"use client";

import { type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ProjectConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  isDanger?: boolean;
  isSubmitting?: boolean;
}

/**
 * Shared confirmation shell for the two destructive/semi-destructive
 * project actions (archive, delete) so both get identical UX instead
 * of ad-hoc window.confirm() calls.
 */
export function ProjectConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  isDanger,
  isSubmitting,
}: ProjectConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-sm text-foreground-muted">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={isDanger ? "danger" : "primary"} onClick={onConfirm} isLoading={isSubmitting}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
