"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { EMPTY_PROJECT_FILTERS, ProjectFilters } from "@/types/project.types";
import { ProjectMember } from "@/types/project.types";
import { ProjectOptionsSettings } from "@/types/settings.types";

interface ProjectFiltersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: ProjectFilters;
  onChange: (filters: ProjectFilters) => void;
  options: ProjectOptionsSettings;
  availableOwners: ProjectMember[];
}

/** Filter by Status, Priority, Owner, Created Date, Due Date — all statuses/priorities sourced from Settings, never hardcoded. */
export function ProjectFiltersPanel({ isOpen, onClose, filters, onChange, options, availableOwners }: ProjectFiltersPanelProps) {
  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter projects" className="max-w-lg">
      <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
        <FilterGroup label="Status">
          {options.statuses.map((status) => (
            <Chip
              key={status.id}
              label={status.label}
              color={status.color}
              active={filters.statusIds.includes(status.id)}
              onClick={() => onChange({ ...filters, statusIds: toggle(filters.statusIds, status.id) })}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="Priority">
          {options.priorities.map((priority) => (
            <Chip
              key={priority.id}
              label={priority.label}
              color={priority.color}
              active={filters.priorityIds.includes(priority.id)}
              onClick={() => onChange({ ...filters, priorityIds: toggle(filters.priorityIds, priority.id) })}
            />
          ))}
        </FilterGroup>

        {availableOwners.length > 0 && (
          <FilterGroup label="Owner">
            {availableOwners.map((owner) => (
              <Chip
                key={owner.uid}
                label={owner.displayName}
                active={filters.ownerIds.includes(owner.uid)}
                onClick={() => onChange({ ...filters, ownerIds: toggle(filters.ownerIds, owner.uid) })}
              />
            ))}
          </FilterGroup>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Due after"
            type="date"
            value={filters.dueAfter ?? ""}
            onChange={(e) => onChange({ ...filters, dueAfter: e.target.value || null })}
          />
          <Input
            label="Due before"
            type="date"
            value={filters.dueBefore ?? ""}
            onChange={(e) => onChange({ ...filters, dueBefore: e.target.value || null })}
          />
        </div>

        <Input
          label="Created after"
          type="date"
          value={filters.createdAfter ?? ""}
          onChange={(e) => onChange({ ...filters, createdAfter: e.target.value || null })}
        />
      </div>

      <div className="mt-5 flex justify-between border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_PROJECT_FILTERS)}>
          Clear all
        </Button>
        <Button size="sm" onClick={onClose}>
          Apply filters
        </Button>
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
