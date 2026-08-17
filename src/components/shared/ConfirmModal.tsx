"use client";

import { type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
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
 * Shared confirmation shell for destructive/semi-destructive actions
 * (archive, delete, remove member, etc.) anywhere in the app —
 * originally written once for Projects and once for Tasks; those
 * two were byte-for-byte identical, so this is the single version
 * both modules use now.
 */
export function ConfirmModal({ isOpen, onClose, onConfirm, title, description, confirmLabel, isDanger, isSubmitting }: ConfirmModalProps) {
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
