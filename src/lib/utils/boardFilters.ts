import { Task } from "@/types/task.types";
import { BoardFilters } from "@/types/board.types";

/** Shared board search+filter predicate — search covers title/description/tags/assignee per spec. */
export function matchesBoardSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const plainDescription = task.descriptionHtml.replace(/<[^>]*>/g, " ").toLowerCase();
  return (
    task.title.toLowerCase().includes(q) ||
    plainDescription.includes(q) ||
    task.tags.some((tag) => tag.toLowerCase().includes(q)) ||
    Boolean(task.assignee?.displayName.toLowerCase().includes(q))
  );
}

export function matchesBoardFilters(task: Task, filters: BoardFilters): boolean {
  if (filters.assigneeIds.length && !(task.assignee && filters.assigneeIds.includes(task.assignee.uid))) return false;
  if (filters.priorityIds.length && !filters.priorityIds.includes(task.priorityId)) return false;
  if (filters.labelIds.length && !task.labelIds.some((l) => filters.labelIds.includes(l))) return false;
  if (filters.tags.length && !task.tags.some((t) => filters.tags.includes(t))) return false;
  if (filters.dueBefore && (!task.dueDate || task.dueDate > filters.dueBefore)) return false;
  if (filters.dueAfter && (!task.dueDate || task.dueDate < filters.dueAfter)) return false;
  return true;
}
