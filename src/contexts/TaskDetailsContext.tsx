"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTask } from "@/hooks/useTask";
import { useTaskOptions } from "@/hooks/useTaskOptions";
import { Task } from "@/types/task.types";
import { TaskOptionsSettings } from "@/types/settings.types";

/**
 * Scoped context for the /tasks/[taskId]/* route tree — loads the
 * task + workspace task-options ONCE in the layout so all detail
 * tabs share one realtime subscription. Mirrors
 * ProjectDetailsContext from the Projects module.
 */
interface TaskDetailsContextValue {
  task: Task | null;
  isLoading: boolean;
  error: string | null;
  options: TaskOptionsSettings;
  isLoadingOptions: boolean;
}

const TaskDetailsContext = createContext<TaskDetailsContextValue | undefined>(undefined);

export function TaskDetailsProvider({ taskId, children }: { taskId: string; children: ReactNode }) {
  const { task, isLoading, error } = useTask(taskId);
  const { options, isLoading: isLoadingOptions } = useTaskOptions();

  return (
    <TaskDetailsContext.Provider value={{ task, isLoading, error, options, isLoadingOptions }}>
      {children}
    </TaskDetailsContext.Provider>
  );
}

export function useTaskDetailsContext(): TaskDetailsContextValue {
  const ctx = useContext(TaskDetailsContext);
  if (!ctx) throw new Error("useTaskDetailsContext must be used within TaskDetailsProvider");
  return ctx;
}
