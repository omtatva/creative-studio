"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useFiles } from "@/hooks/useFiles";

interface ReviewFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onCreate: (title: string, fileIds: string[]) => Promise<void>;
  isSubmitting: boolean;
}

/** Request a review: pick a title and the project files it covers — reuses useFiles(projectId) rather than a separate file picker query. */
export function ReviewFormModal({ isOpen, onClose, projectId, onCreate, isSubmitting }: ReviewFormModalProps) {
  const { files } = useFiles(projectId);
  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!title.trim() || selectedIds.length === 0) return;
    await onCreate(title.trim(), selectedIds);
    setTitle("");
    setSelectedIds([]);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request a review">
      <div className="flex flex-col gap-4">
        <Input label="Review title" placeholder="e.g. Homepage hero — round 1" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Files to review</p>
          {files.length === 0 ? (
            <p className="text-sm text-foreground-muted">Upload files to this project first.</p>
          ) : (
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-theme border border-border p-1.5">
              {files.map((file) => (
                <label key={file.id} className="flex items-center gap-2.5 rounded-theme px-2 py-1.5 text-sm hover:bg-surface-muted">
                  <input type="checkbox" checked={selectedIds.includes(file.id)} onChange={() => toggle(file.id)} className="accent-primary" />
                  {file.fileName}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!title.trim() || selectedIds.length === 0}>
            Request review
          </Button>
        </div>
      </div>
    </Modal>
  );
}
