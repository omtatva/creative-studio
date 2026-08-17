"use client";

import { Activity, ArrowRightLeft, Plus, Pencil, ArrowUpDown, Archive } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBoardActivity } from "@/hooks/useBoardActivity";
import { BoardActivityAction } from "@/types/board.types";
import { timeAgo } from "@/lib/utils/date";

const ACTION_ICONS: Partial<Record<BoardActivityAction, React.ComponentType<{ className?: string }>>> = {
  column_created: Plus,
  column_renamed: Pencil,
  column_reordered: ArrowUpDown,
  column_archived: Archive,
  task_moved: ArrowRightLeft,
  task_reordered: ArrowUpDown,
  tasks_bulk_moved: ArrowRightLeft,
};

/** Board-level activity feed — column management + task moves/reorders, per the spec's Board > Activity requirement. */
export function BoardActivityModal({ isOpen, onClose, boardId }: { isOpen: boolean; onClose: () => void; boardId: string | undefined }) {
  const { entries, isLoading } = useBoardActivity(isOpen ? boardId : undefined);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Board activity" className="max-w-md">
      <div className="max-h-[60vh] overflow-y-auto">
        {!isLoading && entries.length === 0 ? (
          <EmptyState icon={<Activity className="h-8 w-8" />} title="No activity yet" className="py-8" />
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((entry) => {
              const Icon = ACTION_ICONS[entry.action] ?? Activity;
              return (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Avatar name={entry.actor.displayName} src={entry.actor.photoURL} size="sm" />
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{entry.actor.displayName}</span>{" "}
                      <span className="text-foreground-muted">{entry.message}</span>
                    </p>
                    <span className="ml-auto shrink-0 text-xs text-foreground-muted">{timeAgo(entry.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
