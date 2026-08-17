"use client";

import { useEffect, useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getWorkspaceSettings } from "@/services/settingsService";
import { TaskOptionsSettings } from "@/types/settings.types";
import { DEFAULT_TASK_OPTIONS } from "@/lib/constants/taskOptions";

/** Single source every task component reads statuses/priorities/labels from — mirrors useProjectOptions. */
export function useTaskOptions() {
  const { workspaceId } = useWorkspaceContext();
  const [options, setOptions] = useState<TaskOptionsSettings>(DEFAULT_TASK_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setOptions(DEFAULT_TASK_OPTIONS);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getWorkspaceSettings(workspaceId)
      .then((settings) => {
        if (cancelled) return;
        setOptions(settings?.taskOptions ?? DEFAULT_TASK_OPTIONS);
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const getStatus = (id: string) => options.statuses.find((s) => s.id === id) ?? options.statuses[0];
  const getPriority = (id: string) => options.priorities.find((p) => p.id === id) ?? options.priorities[0];
  const getLabel = (id: string) => options.labels.find((l) => l.id === id);

  return { options, isLoading, getStatus, getPriority, getLabel };
}
