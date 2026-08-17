"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { useCalendarTasks } from "@/hooks/useCalendarTasks";
import { useTaskOptions } from "@/hooks/useTaskOptions";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Month-grid view of every workspace task with a due date — reuses useCalendarTasks (same `tasks` collection as Tasks/Board, just workspace-wide and unpaginated) and useTaskOptions for priority coloring. */
export function CalendarPanel() {
  const [cursor, setCursor] = useState(() => new Date());
  const { tasks, isLoading } = useCalendarTasks();
  const { options } = useTaskOptions();

  const tasksByDate = useMemo(() => {
    const map: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = task.dueDate.slice(0, 10);
      (map[key] ??= []).push(task);
    }
    return map;
  }, [tasks]);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayKey = toDateKey(new Date());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-theme border border-border bg-border">
        {WEEKDAYS.map((day) => (
          <div key={day} className="bg-surface-muted px-2 py-1.5 text-center text-xs font-medium text-foreground-muted">
            {day}
          </div>
        ))}

        {days.map((day) => {
          const key = toDateKey(day);
          const isCurrentMonth = day.getMonth() === cursor.getMonth();
          const dayTasks = tasksByDate[key] ?? [];
          return (
            <div
              key={key}
              className={cn("min-h-[92px] bg-surface p-1.5", !isCurrentMonth && "bg-surface-muted/40")}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  key === todayKey ? "bg-primary text-white" : isCurrentMonth ? "text-foreground" : "text-foreground-muted"
                )}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 flex flex-col gap-0.5">
                {dayTasks.slice(0, 3).map((task) => (
                  <CalendarTaskChip key={task.id} task={task} priority={options.priorities.find((p) => p.id === task.priorityId)} />
                ))}
                {dayTasks.length > 3 && <span className="text-[11px] text-foreground-muted">+{dayTasks.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>

      {isLoading && <p className="text-xs text-foreground-muted">Loading tasks...</p>}
    </div>
  );
}
