"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { ProjectColorPicker } from "@/components/projects/ProjectColorPicker";
import { DEFAULT_PROJECT_OPTIONS } from "@/lib/constants/projectOptions";
import { AssetStatusOption } from "@/types/settings.types";

const FALLBACK_COLOR = "99 102 241";
const DEFAULT_COLOR = DEFAULT_PROJECT_OPTIONS.colors[0] ?? FALLBACK_COLOR;

interface EditStatusesModalProps {
  isOpen: boolean;
  onClose: () => void;
  statuses: AssetStatusOption[];
  isSaving: boolean;
  onSave: (statuses: AssetStatusOption[]) => Promise<void>;
}

/**
 * Owner/admin-only status configuration for the Creative Review
 * Workspace's Status dropdown — rename, recolor, enable/disable,
 * reorder, and add custom statuses. Writes the whole list back to
 * WorkspaceSettings.assetOptions in one call (see useAssetOptions);
 * disabling a status (rather than deleting it) is what keeps any
 * file still referencing it from ever showing a blank/broken status.
 */
export function EditStatusesModal({ isOpen, onClose, statuses, isSaving, onSave }: EditStatusesModalProps) {
  const [draft, setDraft] = useState<AssetStatusOption[]>(statuses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);

  useEffect(() => {
    if (isOpen) {
      setDraft([...statuses].sort((a, b) => a.order - b.order));
      setEditingId(null);
      setIsAdding(false);
    }
  }, [isOpen, statuses]);

  function move(id: string, direction: -1 | 1) {
    const index = draft.findIndex((s) => s.id === id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= draft.length) return;
    const current = draft[index];
    const target = draft[swapWith];
    if (!current || !target) return;
    const next = [...draft];
    next[index] = target;
    next[swapWith] = current;
    setDraft(next.map((s, i) => ({ ...s, order: i })));
  }

  function toggleEnabled(id: string) {
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, isEnabled: !s.isEnabled } : s)));
  }

  function startEdit(status: AssetStatusOption) {
    setEditingId(status.id);
    setEditLabel(status.label);
    setEditColor(status.color);
  }

  function saveEdit(id: string) {
    if (!editLabel.trim()) return;
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, label: editLabel.trim(), color: editColor } : s)));
    setEditingId(null);
  }

  function removeStatus(id: string) {
    setDraft((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
  }

  function addStatus() {
    if (!newLabel.trim()) return;
    const id = `custom_${Date.now()}`;
    setDraft((prev) => [...prev, { id, label: newLabel.trim(), color: newColor, isEnabled: true, order: prev.length }]);
    setNewLabel("");
    setNewColor(DEFAULT_COLOR);
    setIsAdding(false);
  }

  async function handleSave() {
    await onSave(draft);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit statuses" className="max-w-md">
      <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
        {draft.map((status, index) =>
          editingId === status.id ? (
            <div key={status.id} className="flex flex-col gap-2 rounded-theme border border-primary bg-surface p-2.5">
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" />
              <ProjectColorPicker colors={DEFAULT_PROJECT_OPTIONS.colors} value={editColor} onChange={setEditColor} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={() => saveEdit(status.id)}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div key={status.id} className="flex items-center gap-2 rounded-theme border border-border bg-surface px-2.5 py-2">
              <div className="flex flex-col">
                <button onClick={() => move(status.id, -1)} disabled={index === 0} className="text-foreground-muted disabled:opacity-20" aria-label="Move up">
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button onClick={() => move(status.id, 1)} disabled={index === draft.length - 1} className="text-foreground-muted disabled:opacity-20" aria-label="Move down">
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: `rgb(${status.color})` }} />
              <span className={cnMuted(!status.isEnabled)}>{status.label}</span>
              <ToggleSwitch checked={status.isEnabled} onChange={() => toggleEnabled(status.id)} />
              <button onClick={() => startEdit(status)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => removeStatus(status.id)}
                disabled={draft.length <= 1}
                className="rounded-theme p-1.5 text-foreground-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        )}

        {isAdding ? (
          <div className="flex flex-col gap-2 rounded-theme border border-primary bg-surface p-2.5">
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New status..." />
            <ProjectColorPicker colors={DEFAULT_PROJECT_OPTIONS.colors} value={newColor} onChange={setNewColor} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={addStatus} disabled={!newLabel.trim()}>Add</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-1.5 rounded-theme border border-dashed border-border py-2 text-xs font-medium text-foreground-muted hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add status
          </button>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} isLoading={isSaving}>Save changes</Button>
      </div>
    </Modal>
  );
}

function cnMuted(muted: boolean) {
  return `flex-1 text-sm ${muted ? "text-foreground-muted line-through" : "text-foreground"}`;
}
