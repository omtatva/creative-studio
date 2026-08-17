"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useReviewActions } from "@/hooks/useReviewActions";
import { useToast } from "@/hooks/useToast";
import { ProjectFile } from "@/types/file.types";

/** "Send for Review" from a single asset — reuses reviewService.createReview unchanged, just pre-scoped to this one file/version. */
export function SendForReviewModal({ asset, isOpen, onClose }: { asset: ProjectFile; isOpen: boolean; onClose: () => void }) {
  const actions = useReviewActions();
  const toast = useToast();
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (isOpen) setTitle(`${asset.fileName} — v${asset.versionNumber} review`);
  }, [isOpen, asset.fileName, asset.versionNumber]);

  async function handleSubmit() {
    if (!title.trim()) return;
    const reviewId = await actions.create(asset.projectId, title.trim(), [asset.id]);
    if (reviewId) {
      toast.success("Sent for review");
      onClose();
    } else {
      toast.error(actions.error ?? "Couldn't send for review. Please try again.");
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send for review">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">
          Requests approval on <span className="font-medium text-foreground">{asset.fileName}</span> (v{asset.versionNumber}).
        </p>
        <Input label="Review title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={actions.isSubmitting} disabled={!title.trim()}>
            Send for review
          </Button>
        </div>
      </div>
    </Modal>
  );
}
