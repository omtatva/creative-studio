"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { STAGE_TEMPLATES } from "@/lib/constants/stageTemplates";
import { useStageActions } from "@/hooks/useStageActions";
import { useToast } from "@/hooks/useToast";

interface StageFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  /** Opens straight into the template picker step ("Create from Template" toolbar button) instead of a blank form ("Create Stage"). */
  startWithTemplates?: boolean;
  onCreated?: (stageId: string) => void;
}

/** Creates a real Stage doc (see stageService.createStage) — "from template" only prefills name/description, no fake assets are seeded. */
export function StageFormModal({ isOpen, onClose, projectId, startWithTemplates, onCreated }: StageFormModalProps) {
  const actions = useStageActions();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(Boolean(startWithTemplates));

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setTemplateKey(null);
      setShowTemplates(Boolean(startWithTemplates));
    }
  }, [isOpen, startWithTemplates]);

  function pickTemplate(key: string) {
    const template = STAGE_TEMPLATES.find((t) => t.key === key);
    if (!template) return;
    setTemplateKey(key);
    setName(template.name);
    setDescription(template.description);
    setShowTemplates(false);
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    const stageId = await actions.create(projectId, { name: name.trim(), description: description.trim(), templateKey });
    if (stageId) {
      toast.success(`Stage "${name.trim()}" created`);
      onCreated?.(stageId);
      onClose();
    } else {
      toast.error(actions.error ?? "Couldn't create stage. Please try again.");
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={showTemplates ? "Create from template" : "Create stage"}>
      {showTemplates ? (
        <div className="flex flex-col gap-2">
          {STAGE_TEMPLATES.map((template) => (
            <button
              key={template.key}
              onClick={() => pickTemplate(template.key)}
              className="rounded-theme border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-muted"
            >
              <p className="text-sm font-medium text-foreground">{template.name}</p>
              <p className="text-xs text-foreground-muted">{template.description}</p>
            </button>
          ))}
          <button onClick={() => setShowTemplates(false)} className={cn("mt-1 text-left text-xs text-primary hover:underline")}>
            Or start from a blank stage
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input label="Stage name" placeholder="e.g. Homepage Hero Video" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label="Description" rows={3} placeholder="What is this stage for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} isLoading={actions.isSubmitting} disabled={!name.trim()}>
              Create stage
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
