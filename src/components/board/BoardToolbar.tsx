"use client";

import { LayoutGrid, Rows3, SlidersHorizontal, Plus, Settings2, Activity } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { BoardCardSize, BoardViewDensity } from "@/types/board.types";

interface BoardToolbarProps {
  onSearchChange: (value: string) => void;
  viewDensity: BoardViewDensity;
  onViewDensityChange: (density: BoardViewDensity) => void;
  cardSize: BoardCardSize;
  onCardSizeChange: (size: BoardCardSize) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onAddColumn: () => void;
  onOpenSettings: () => void;
  onOpenActivity: () => void;
}

const CARD_SIZES: BoardCardSize[] = ["sm", "md", "lg"];

export function BoardToolbar({
  onSearchChange,
  viewDensity,
  onViewDensityChange,
  cardSize,
  onCardSizeChange,
  activeFilterCount,
  onOpenFilters,
  onAddColumn,
  onOpenSettings,
  onOpenActivity,
}: BoardToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchBar onSearch={onSearchChange} placeholder="Search title, description, tags, assignee..." />

      <div className="flex flex-wrap items-center gap-2">
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
            onClick={() => onViewDensityChange("comfortable")}
            className={cn("rounded-theme p-1.5", viewDensity === "comfortable" ? "bg-primary/10 text-primary" : "text-foreground-muted")}
            aria-label="Comfortable view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewDensityChange("compact")}
            className={cn("rounded-theme p-1.5", viewDensity === "compact" ? "bg-primary/10 text-primary" : "text-foreground-muted")}
            aria-label="Compact view"
          >
            <Rows3 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-theme border border-border px-2 py-1 text-xs text-foreground-muted">
          {CARD_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onCardSizeChange(size)}
              className={cn("px-1.5 py-0.5 rounded uppercase", cardSize === size ? "bg-primary/10 text-primary font-medium" : "")}
            >
              {size}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={onOpenSettings} aria-label="Board settings">
          <Settings2 className="h-4 w-4" />
        </Button>

        <Button variant="outline" size="sm" onClick={onOpenActivity} aria-label="Board activity">
          <Activity className="h-4 w-4" />
        </Button>

        <Button size="sm" onClick={onAddColumn}>
          <Plus className="h-4 w-4" />
          Column
        </Button>
      </div>
    </div>
  );
}
