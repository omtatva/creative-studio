"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ProjectColorPicker } from "@/components/projects/ProjectColorPicker";
import { getStatusIcon, STATUS_ICON_KEYS } from "@/lib/constants/statusIconMap";
import { TaskStatusOption } from "@/types/settings.types";

interface TaskStatusListEditorProps {
  items: TaskStatusOption[];
  colors: string[];
  onCreate: (status: Omit<TaskStatusOption, "id">) => void;
  onUpdate: (id: string, patch: Partial<TaskStatusOption>) => void;
  onDelete: (id: string) => void;
}

/**
 * Task statuses need an icon and an "counts as complete" flag on
 * top of label+color, so this is a dedicated editor rather than
 * forcing OptionListEditor to support every possible extra field —
 * same interaction pattern (inline add/edit rows), one more field.
 */
export function TaskStatusListEditor({ items, colors, onCreate, onUpdate, onDelete }: TaskStatusListEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<TaskStatusOption, "id">>({ label: "", color: colors[0], icon: STATUS_ICON_KEYS[0], isCompletedStatus: false });
  const [isAdding, setIsAdding] = useState(false);

  function startEdit(item: TaskStatusOption) {
    setEditingId(item.id);
    setDraft({ label: item.label, color: item.color, icon: item.icon, isCompletedStatus: item.isCompletedStatus });
  }

  function resetDraft() {
    setDraft({ label: "", color: colors[0], icon: STATUS_ICON_KEYS[0], isCompletedStatus: false });
  }

  function renderForm(onSave: () => void, onCancel: () => void) {
    return (
      <div className="flex flex-col gap-2 rounded-theme border border-primary bg-surface p-2.5">
        <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Label" />
        <ProjectColorPicker colors={colors} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ICON_KEYS.map((key) => {
            const Icon = getStatusIcon(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDraft({ ...draft, icon: key })}
                className={`flex h-8 w-8 items-center justify-center rounded-theme border ${draft.icon === key ? "border-primary bg-primary/10" : "border-border hover:bg-surface-muted"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground-muted">
          <input type="checkbox" checked={draft.isCompletedStatus} onChange={(e) => setDraft({ ...draft, isCompletedStatus: e.target.checked })} className="accent-primary" />
          Counts as "completed" (drives progress bars)
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={onSave} disabled={!draft.label.trim()}><Check className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const Icon = getStatusIcon(item.icon);
        return editingId === item.id ? (
          <div key={item.id}>{renderForm(() => { onUpdate(item.id, draft); setEditingId(null); }, () => setEditingId(null))}</div>
        ) : (
          <div key={item.id} className="flex items-center gap-2.5 rounded-theme border border-border bg-surface px-2.5 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-theme" style={{ backgroundColor: `rgb(${item.color} / 0.15)` }}>
              <Icon className="h-3.5 w-3.5" style={{ color: `rgb(${item.color})` }} />
            </span>
            <span className="flex-1 text-sm text-foreground">{item.label}</span>
            {item.isCompletedStatus && <span className="text-xs text-foreground-muted">Completed</span>}
            <button onClick={() => startEdit(item)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => onDelete(item.id)} disabled={items.length <= 1} className="rounded-theme p-1.5 text-foreground-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30" aria-label="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {isAdding ? (
        renderForm(
          () => { onCreate(draft); resetDraft(); setIsAdding(false); },
          () => { resetDraft(); setIsAdding(false); }
        )
      ) : (
        <button onClick={() => setIsAdding(true)} className="flex items-center justify-center gap-1.5 rounded-theme border border-dashed border-border py-2 text-xs font-medium text-foreground-muted hover:border-primary hover:text-primary">
          <Plus className="h-3.5 w-3.5" />
          Add status
        </button>
      )}
    </div>
  );
}
