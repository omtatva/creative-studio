"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Calendar, CheckSquare, ListTree, MessageSquare, Paperclip } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { TaskPriorityBadge } from "@/components/tasks/TaskPriorityBadge";
import { TaskLabelChip } from "@/components/tasks/TaskLabelChip";
import { BoardCardContextMenu } from "./BoardCardContextMenu";
import { cn } from "@/lib/utils/cn";
import { formatDueDate, isOverdue } from "@/lib/utils/date";
import { taskRoute } from "@/lib/constants/routes";
import { Task } from "@/types/task.types";
import { TaskPriorityOption, TaskLabelOption } from "@/types/settings.types";
import { BoardCardSize } from "@/types/board.types";

interface BoardCardProps {
  task: Task;
  priority: TaskPriorityOption | undefined;
  labels: (TaskLabelOption | undefined)[];
  cardSize: BoardCardSize;
  isSelected: boolean;
  isDragging: boolean;
  attachmentCount: number;
  commentCount: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleSelect: (withModifier: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMove: () => void;
  onAssign: () => void;
}

/**
 * The draggable card. Displays every field the spec calls out —
 * name, priority, assignee, due date, checklist progress, attachment
 * count, comment count, labels — and status is implied by which
 * column it's in, so it's not repeated on the card itself.
 * Right-click opens BoardCardContextMenu; a plain click opens the
 * task (ctrl/cmd+click toggles multi-select instead of navigating).
 */
export function BoardCard({
  task,
  priority,
  labels,
  cardSize,
  isSelected,
  isDragging,
  attachmentCount,
  commentCount,
  onDragStart,
  onDragEnd,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onMove,
  onAssign,
}: BoardCardProps) {
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const checklistTotal = task.checklist.length;
  const checklistDone = task.checklist.filter((c) => c.isCompleted).length;

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }

  function handleClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect(true);
    }
  }

  return (
    <motion.div
      layout
      layoutId={task.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={handleContextMenu}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0, scale: isDragging ? 0.98 : 1 }}
      transition={{ duration: 0.15 }}
      whileHover={{ y: -2 }}
      className={cn(
        "group cursor-grab rounded-theme border bg-surface shadow-soft transition-colors active:cursor-grabbing",
        isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40",
        cardSize === "sm" ? "p-2.5" : cardSize === "lg" ? "p-4" : "p-3"
      )}
    >
      <Link href={taskRoute(task.id)} onClick={handleClick} className="block">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("font-medium text-foreground", cardSize === "sm" ? "text-xs" : "text-sm")}>{task.title}</p>
        </div>

        {labels.length > 0 && cardSize !== "sm" && (
          <div className="mt-2 flex flex-wrap gap-1">
            {labels.map((label) => label && <TaskLabelChip key={label.id} label={label} />)}
          </div>
        )}

        {checklistTotal > 0 && cardSize !== "sm" && (
          <div className="mt-2 flex items-center gap-1 text-xs text-foreground-muted">
            <CheckSquare className="h-3 w-3" />
            {checklistDone}/{checklistTotal}
          </div>
        )}

        {task.subtaskCount > 0 && cardSize !== "sm" && (
          <div className="mt-1 flex items-center gap-1 text-xs text-foreground-muted">
            <ListTree className="h-3 w-3" />
            {task.completedSubtaskCount}/{task.subtaskCount} subtasks
          </div>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <TaskPriorityBadge priority={priority} />
            {task.dueDate && (
              <span className={cn("flex items-center gap-1 text-xs", isOverdue(task.dueDate) && !task.isCompleted ? "text-error" : "text-foreground-muted")}>
                <Calendar className="h-3 w-3" />
                {formatDueDate(task.dueDate)}
              </span>
            )}
          </div>
          {task.assignee && <Avatar name={task.assignee.displayName} src={task.assignee.photoURL} size="sm" />}
        </div>

        {(attachmentCount > 0 || commentCount > 0) && (
          <div className="mt-2 flex items-center gap-3 text-xs text-foreground-muted">
            {attachmentCount > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {attachmentCount}
              </span>
            )}
            {commentCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {commentCount}
              </span>
            )}
          </div>
        )}
      </Link>

      {contextMenuPos && (
        <BoardCardContextMenu
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onDelete={onDelete}
          onMove={onMove}
          onAssign={onAssign}
          taskId={task.id}
        />
      )}
    </motion.div>
  );
}
