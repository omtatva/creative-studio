"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Archive, ArrowRightLeft, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TaskStatusOption } from "@/types/settings.types";

interface BulkActionsBarProps {
  selectedCount: number;
  statuses: TaskStatusOption[];
  onBulkMove: (status: TaskStatusOption) => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onClear: () => void;
}

/** Sticky bar that appears once 2+ cards are cmd/ctrl-selected — bulk move/archive/delete, per spec's "Multi-select tasks / Bulk move tasks". */
export function BulkActionsBar({ selectedCount, statuses, onBulkMove, onBulkArchive, onBulkDelete, onClear }: BulkActionsBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-theme border border-border bg-surface px-4 py-2.5 shadow-soft-lg"
        >
          <span className="text-sm font-medium text-foreground">{selectedCount} selected</span>

          <div className="relative">
            <select
              onChange={(e) => {
                const status = statuses.find((s) => s.id === e.target.value);
                if (status) onBulkMove(status);
                e.target.value = "";
              }}
              defaultValue=""
              className="h-8 rounded-theme border border-border bg-surface pl-2 pr-6 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="" disabled>
                <ArrowRightLeft className="h-3 w-3" /> Move to...
              </option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          <Button size="sm" variant="outline" onClick={onBulkArchive}>
            <Archive className="h-3.5 w-3.5" />
            Archive
          </Button>
          <Button size="sm" variant="danger" onClick={onBulkDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <button onClick={onClear} className="rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Clear selection">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
