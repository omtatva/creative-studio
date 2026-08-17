import Link from "next/link";
import { taskRoute } from "@/lib/constants/routes";
import { Task } from "@/types/task.types";
import { TaskPriorityOption } from "@/types/settings.types";

export function CalendarTaskChip({ task, priority }: { task: Task; priority: TaskPriorityOption | undefined }) {
  return (
    <Link
      href={taskRoute(task.id)}
      className="block truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80"
      style={{ backgroundColor: `rgb(${priority?.color ?? "148 163 184"} / 0.12)`, color: `rgb(${priority?.color ?? "148 163 184"})` }}
    >
      {task.title}
    </Link>
  );
}
