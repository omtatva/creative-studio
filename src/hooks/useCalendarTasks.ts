"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { tasksCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAccessibleProjectIds } from "@/hooks/useAccessibleProjectIds";
import { Task } from "@/types/task.types";

const ID_QUERY_CHUNK_SIZE = 30;

/**
 * Every non-archived, dated task across the workspace (not just one
 * project) — the Calendar module's data source, reusing the same
 * `tasks` collection as Tasks/Board. Scoped to the caller's
 * accessible projects (see useAccessibleProjectIds.ts) for a regular
 * project member, same reasoning as useTasks.ts — Calendar must not
 * surface a task from a project the user was never added to.
 */
export function useCalendarTasks() {
  const { workspaceId } = useWorkspaceContext();
  const { projectIds: accessibleProjectIds, isLoading: isLoadingAccess } = useAccessibleProjectIds();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    if (isLoadingAccess) return;

    if (accessibleProjectIds === null) {
      setIsLoading(true);
      const q = query(tasksCol(), where("workspaceId", "==", workspaceId));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setTasks(snapshot.docs.map((d) => d.data()).filter((t) => !t.isArchived && t.dueDate));
        setIsLoading(false);
      });
      return unsubscribe;
    }

    if (accessibleProjectIds.length === 0) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const chunks: string[][] = [];
    for (let i = 0; i < accessibleProjectIds.length; i += ID_QUERY_CHUNK_SIZE) {
      chunks.push(accessibleProjectIds.slice(i, i + ID_QUERY_CHUNK_SIZE));
    }

    const resultsByChunk = new Map<number, Task[]>();
    const unsubscribers = chunks.map((chunk, index) =>
      onSnapshot(
        query(tasksCol(), where("workspaceId", "==", workspaceId), where("projectId", "in", chunk)),
        (snapshot) => {
          resultsByChunk.set(
            index,
            snapshot.docs.map((d) => d.data()).filter((t) => !t.isArchived && t.dueDate)
          );
          setTasks(Array.from(resultsByChunk.values()).flat());
          setIsLoading(false);
        }
      )
    );
    return () => unsubscribers.forEach((u) => u());
  }, [workspaceId, accessibleProjectIds, isLoadingAccess]);

  return { tasks, isLoading };
}
