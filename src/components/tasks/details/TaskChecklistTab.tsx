"use client";

import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { useTaskActions } from "@/hooks/useTaskActions";

/** Checklist items with completion toggling and a live progress % — satisfies "Checklist items / Mark complete / Progress %". */
export function TaskChecklistTab() {
  const { task } = useTaskDetailsContext();
  const actions = useTaskActions();
  const [draft, setDraft] = useState("");

  if (!task) return null;

  const total = task.checklist.length;
  const completed = task.checklist.filter((i) => i.isCompleted).length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  async function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    await actions.addChecklistItem(task!.id, text);
    setDraft("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist</CardTitle>
        {total > 0 && <span className="text-xs text-foreground-muted">{completed}/{total} · {progress}%</span>}
      </CardHeader>

      {total > 0 && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {total === 0 ? (
        <EmptyState title="No checklist items yet" description="Break this task into smaller steps." className="py-8" />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {task.checklist.map((item) => (
            <div key={item.id} className="group flex items-center gap-3 py-2.5">
              <button
                onClick={() => actions.toggleChecklistItem(task!.id, item.id)}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                  item.isCompleted ? "border-primary bg-primary text-white" : "border-border hover:border-primary"
                )}
                aria-label={item.isCompleted ? "Mark incomplete" : "Mark complete"}
              >
                {item.isCompleted && <Check className="h-3 w-3" />}
              </button>
              <span className={cn("flex-1 text-sm", item.isCompleted ? "text-foreground-muted line-through" : "text-foreground")}>
                {item.text}
              </span>
              <button
                onClick={() => actions.removeChecklistItem(task!.id, item.id)}
                className="rounded-theme p-1 text-foreground-muted opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                aria-label="Remove item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a checklist item..."
          className="flex-1"
        />
        <Button size="sm" onClick={handleAdd} disabled={!draft.trim()} isLoading={actions.isSubmitting}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </Card>
  );
}
