"use client";

import { LayoutGrid, List, SlidersHorizontal, Plus, ArrowUpDown } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { ProjectSort, ProjectSortField, ProjectViewMode } from "@/types/project.types";

const SORT_OPTIONS: { field: ProjectSortField; label: string }[] = [
  { field: "updatedAt", label: "Last updated" },
  { field: "createdAt", label: "Date created" },
  { field: "dueDate", label: "Due date" },
  { field: "name", label: "Name" },
  { field: "progress", label: "Progress" },
];

interface ProjectListToolbarProps {
  viewMode: ProjectViewMode;
  onViewModeChange: (mode: ProjectViewMode) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sort: ProjectSort;
  onSortChange: (sort: ProjectSort) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onCreateProject: () => void;
}

export function ProjectListToolbar({
  viewMode,
  onViewModeChange,
  onSearchChange,
  sort,
  onSortChange,
  activeFilterCount,
  onOpenFilters,
  onCreateProject,
}: ProjectListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchBar onSearch={onSearchChange} placeholder="Search by name, tag, owner, or status..." />

      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            value={sort.field}
            onChange={(e) => onSortChange({ ...sort, field: e.target.value as ProjectSortField })}
            className="h-9 appearance-none rounded-theme border border-border bg-surface pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.field} value={opt.field}>
                {opt.label}
              </option>
            ))}
          </select>
          <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-muted" />
        </div>

        <Button variant="outline" size="sm" onClick={onOpenFilters} className="relative">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="flex items-center rounded-theme border border-border p-0.5">
          <button
            onClick={() => onViewModeChange("grid")}
            className={cn("rounded-theme p-1.5", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-foreground-muted")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={cn("rounded-theme p-1.5", viewMode === "list" ? "bg-primary/10 text-primary" : "text-foreground-muted")}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <Button size="sm" onClick={onCreateProject}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>
    </div>
  );
}
