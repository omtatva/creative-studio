"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

interface SimpleTemplate {
  id: string;
  name: string;
  description: string;
}

interface TemplateListEditorProps<T extends SimpleTemplate> {
  items: T[];
  onCreate: (name: string, description: string) => void;
  onDelete: (id: string) => void;
}

/** name+description CRUD list — used directly for Project templates; Task templates need one more field so that list is built inline in the Task Settings page instead. */
export function TemplateListEditor<T extends SimpleTemplate>({ items, onCreate, onDelete }: TemplateListEditorProps<T>) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function save() {
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim());
    setName("");
    setDescription("");
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2.5 rounded-theme border border-border bg-surface px-2.5 py-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{item.name}</p>
            {item.description && <p className="text-xs text-foreground-muted">{item.description}</p>}
          </div>
          <button onClick={() => onDelete(item.id)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-red-500/10 hover:text-red-500" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {isAdding ? (
        <div className="flex flex-col gap-2 rounded-theme border border-primary bg-surface p-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!name.trim()}>Add</Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-1.5 rounded-theme border border-dashed border-border py-2 text-xs font-medium text-foreground-muted hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Add template
        </button>
      )}
    </div>
  );
}
