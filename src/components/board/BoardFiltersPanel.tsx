"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { BoardFilters, EMPTY_BOARD_FILTERS } from "@/types/board.types";
import { TaskActor } from "@/types/task.types";
import { TaskOptionsSettings } from "@/types/settings.types";

interface BoardFiltersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  options: TaskOptionsSettings;
  availableAssignees: TaskActor[];
}

/** Filters the board by Assignee/Priority/Labels/Tags/Due date — Status is controlled via per-column hide/show instead of a duplicate filter here. */
export function BoardFiltersPanel({ isOpen, onClose, filters, onChange, options, availableAssignees }: BoardFiltersPanelProps) {
  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter board" className="max-w-lg">
      <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
        <FilterGroup label="Priority">
          {options.priorities.map((p) => (
            <Chip key={p.id} label={p.label} color={p.color} active={filters.priorityIds.includes(p.id)} onClick={() => onChange({ ...filters, priorityIds: toggle(filters.priorityIds, p.id) })} />
          ))}
        </FilterGroup>

        <FilterGroup label="Label">
          {options.labels.map((l) => (
            <Chip key={l.id} label={l.label} color={l.color} active={filters.labelIds.includes(l.id)} onClick={() => onChange({ ...filters, labelIds: toggle(filters.labelIds, l.id) })} />
          ))}
        </FilterGroup>

        {availableAssignees.length > 0 && (
          <FilterGroup label="Assignee">
            {availableAssignees.map((a) => (
              <Chip key={a.uid} label={a.displayName} active={filters.assigneeIds.includes(a.uid)} onClick={() => onChange({ ...filters, assigneeIds: toggle(filters.assigneeIds, a.uid) })} />
            ))}
          </FilterGroup>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Due after" type="date" value={filters.dueAfter ?? ""} onChange={(e) => onChange({ ...filters, dueAfter: e.target.value || null })} />
          <Input label="Due before" type="date" value={filters.dueBefore ?? ""} onChange={(e) => onChange({ ...filters, dueBefore: e.target.value || null })} />
        </div>
      </div>

      <div className="mt-5 flex justify-between border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_BOARD_FILTERS)}>Clear all</Button>
        <Button size="sm" onClick={onClose}>Apply filters</Button>
      </div>
    </Modal>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground-muted hover:bg-surface-muted"
      )}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(${color})` }} />}
      {label}
    </button>
  );
}
