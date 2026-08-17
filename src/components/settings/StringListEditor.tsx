"use client";

import { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface StringListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

/**
 * Ordered add/remove/reorder list of plain strings — the same shape
 * covers Project Settings' "Default folder structure" and Review
 * Settings' "Default review stages", so this is written once and
 * used in both instead of two near-identical CRUD lists.
 */
export function StringListEditor({ items, onChange, placeholder }: StringListEditorProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft("");
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const current = items[index];
    const swapWith = items[target];
    if (current === undefined || swapWith === undefined) return;
    const next = [...items];
    next[index] = swapWith;
    next[target] = current;
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex items-center gap-2 rounded-theme border border-border bg-surface px-2.5 py-2">
          <GripVertical className="h-4 w-4 shrink-0 text-foreground-muted" />
          <span className="flex-1 text-sm text-foreground">{item}</span>
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="text-xs text-foreground-muted hover:text-foreground disabled:opacity-30">
            Up
          </button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="text-xs text-foreground-muted hover:text-foreground disabled:opacity-30">
            Down
          </button>
          <button type="button" onClick={() => remove(index)} className="rounded-theme p-1 text-foreground-muted hover:bg-red-500/10 hover:text-red-500" aria-label="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder ?? "Add item..."}
          className="flex-1"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}
