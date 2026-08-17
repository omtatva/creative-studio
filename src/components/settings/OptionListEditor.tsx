"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ProjectColorPicker } from "@/components/projects/ProjectColorPicker";

interface ColorLabelOption {
  id: string;
  label: string;
  color: string;
}

interface OptionListEditorProps<T extends ColorLabelOption> {
  items: T[];
  colors: string[];
  onCreate: (label: string, color: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<T, "label" | "color">>) => void;
  onDelete: (id: string) => void;
  minItems?: number; // block deleting below this count, e.g. keep at least one status
}

/**
 * Generic label+color CRUD list — the shared shape behind Project
 * Settings' statuses/priorities and Task Settings' priorities/
 * labels (Task Statuses additionally needs an icon + "counts as
 * complete" flag, so that one list is built directly in the Task
 * Settings page instead of forcing this component to support every
 * possible extra field).
 */
export function OptionListEditor<T extends ColorLabelOption>({ items, colors, onCreate, onUpdate, onDelete, minItems = 1 }: OptionListEditorProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState(colors[0]);

  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(colors[0]);

  function startEdit(item: T) {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditColor(item.color);
  }

  function saveEdit(id: string) {
    if (!editLabel.trim()) return;
    onUpdate(id, { label: editLabel.trim(), color: editColor } as Partial<Pick<T, "label" | "color">>);
    setEditingId(null);
  }

  function saveNew() {
    if (!newLabel.trim()) return;
    onCreate(newLabel.trim(), newColor);
    setNewLabel("");
    setNewColor(colors[0]);
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) =>
        editingId === item.id ? (
          <div key={item.id} className="flex flex-col gap-2 rounded-theme border border-primary bg-surface p-2.5">
            <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" />
            <ProjectColorPicker colors={colors} value={editColor} onChange={setEditColor} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={() => saveEdit(item.id)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div key={item.id} className="flex items-center gap-2.5 rounded-theme border border-border bg-surface px-2.5 py-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: `rgb(${item.color})` }} />
            <span className="flex-1 text-sm text-foreground">{item.label}</span>
            <button onClick={() => startEdit(item)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              disabled={items.length <= minItems}
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
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New label..." />
          <ProjectColorPicker colors={colors} value={newColor} onChange={setNewColor} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveNew} disabled={!newLabel.trim()}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-1.5 rounded-theme border border-dashed border-border py-2 text-xs font-medium text-foreground-muted hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Add option
        </button>
      )}
    </div>
  );
}
