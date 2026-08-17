"use client";

import { AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { BoardColumnHeader } from "./BoardColumnHeader";
import { BoardCard } from "./BoardCard";
import { BoardCardSkeleton } from "./BoardCardSkeleton";
import { cn } from "@/lib/utils/cn";
import { Task } from "@/types/task.types";
import { TaskOptionsSettings } from "@/types/settings.types";
import { BoardCardSize, BoardColumn } from "@/types/board.types";

interface BoardColumnComponentProps {
  column: BoardColumn;
  status: TaskOptionsSettings["statuses"][number];
  tasks: Task[];
  options: TaskOptionsSettings;
  cardSize: BoardCardSize;
  width: number;
  isCollapsed: boolean;
  isLoading: boolean;
  draggingTaskId: string | null;
  isDragOver: boolean;
  selectedTaskIds: Set<string>;
  attachmentCounts: Record<string, number>;
  commentCounts: Record<string, number>;
  onToggleCollapsed: () => void;
  onRename: (label: string) => void;
  onChangeColor: (color: string) => void;
  onChangeIcon: (icon: string) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onAddTask: () => void;
  onDragStartTask: (task: Task) => void;
  onDragEndTask: () => void;
  onDragOverColumn: (index: number) => void;
  onDropOnColumn: (index: number) => void;
  onToggleSelectTask: (taskId: string, withModifier: boolean) => void;
  onEditTask: (task: Task) => void;
  onDuplicateTask: (task: Task) => void;
  onArchiveTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onMoveTask: (task: Task) => void;
  onAssignTask: (task: Task) => void;
}

/**
 * A droppable column. Sticky header, scrollable card list, native
 * HTML5 drop zone on the whole card area — column membership is
 * derived entirely from `task.statusId === status.id`, board_columns
 * never stores task ids (see board.types.ts).
 */
export function BoardColumnComponent({
  column,
  status,
  tasks,
  options,
  cardSize,
  width,
  isCollapsed,
  isLoading,
  draggingTaskId,
  isDragOver,
  selectedTaskIds,
  attachmentCounts,
  commentCounts,
  onToggleCollapsed,
  onRename,
  onChangeColor,
  onChangeIcon,
  onToggleHidden,
  onArchive,
  onRestore,
  onAddTask,
  onDragStartTask,
  onDragEndTask,
  onDragOverColumn,
  onDropOnColumn,
  onToggleSelectTask,
  onEditTask,
  onDuplicateTask,
  onArchiveTask,
  onDeleteTask,
  onMoveTask,
  onAssignTask,
}: BoardColumnComponentProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col rounded-theme border bg-surface-muted/40 transition-colors",
        isDragOver ? "border-primary bg-primary/5" : "border-border"
      )}
      style={{ width: isCollapsed ? 56 : width }}
    >
      <div className="sticky top-0 z-10 rounded-t-theme bg-surface-muted/80 backdrop-blur-glass">
        <BoardColumnHeader
          status={status}
          column={column}
          taskCount={tasks.length}
          isCollapsed={isCollapsed}
          onToggleCollapsed={onToggleCollapsed}
          onRename={onRename}
          onChangeColor={onChangeColor}
          onChangeIcon={onChangeIcon}
          onToggleHidden={onToggleHidden}
          onArchive={onArchive}
          onRestore={onRestore}
        />
      </div>

      {!isCollapsed && (
        <div
          className="flex flex-1 flex-col gap-2 overflow-y-auto p-2"
          style={{ maxHeight: "calc(100vh - 260px)" }}
          onDragOver={(e) => {
            e.preventDefault();
            onDragOverColumn(tasks.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDropOnColumn(tasks.length);
          }}
        >
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => <BoardCardSkeleton key={i} />)
          ) : (
            <AnimatePresence initial={false}>
              {tasks.map((task, index) => (
                <div
                  key={task.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDragOverColumn(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropOnColumn(index);
                  }}
                >
                  <BoardCard
                    task={task}
                    priority={options.priorities.find((p) => p.id === task.priorityId)}
                    labels={task.labelIds.map((id) => options.labels.find((l) => l.id === id))}
                    cardSize={cardSize}
                    isSelected={selectedTaskIds.has(task.id)}
                    isDragging={draggingTaskId === task.id}
                    attachmentCount={attachmentCounts[task.id] ?? 0}
                    commentCount={commentCounts[task.id] ?? 0}
                    onDragStart={() => onDragStartTask(task)}
                    onDragEnd={onDragEndTask}
                    onToggleSelect={(withModifier) => onToggleSelectTask(task.id, withModifier)}
                    onEdit={() => onEditTask(task)}
                    onDuplicate={() => onDuplicateTask(task)}
                    onArchive={() => onArchiveTask(task)}
                    onDelete={() => onDeleteTask(task)}
                    onMove={() => onMoveTask(task)}
                    onAssign={() => onAssignTask(task)}
                  />
                </div>
              ))}
            </AnimatePresence>
          )}

          <button
            onClick={onAddTask}
            className="flex items-center justify-center gap-1.5 rounded-theme border border-dashed border-border py-2 text-xs font-medium text-foreground-muted hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add task
          </button>
        </div>
      )}
    </div>
  );
}
