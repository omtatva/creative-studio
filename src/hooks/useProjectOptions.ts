"use client";

import { useEffect, useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getWorkspaceSettings } from "@/services/settingsService";
import { ProjectOptionsSettings } from "@/types/settings.types";
import { DEFAULT_PROJECT_OPTIONS } from "@/lib/constants/projectOptions";

/**
 * Single source every project component reads statuses/priorities/
 * colors/icons from — never a hardcoded list. Falls back to
 * DEFAULT_PROJECT_OPTIONS only while loading or for a workspace
 * created before `projectOptions` existed on the settings doc.
 */
export function useProjectOptions() {
  const { workspaceId } = useWorkspaceContext();
  const [options, setOptions] = useState<ProjectOptionsSettings>(DEFAULT_PROJECT_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setOptions(DEFAULT_PROJECT_OPTIONS);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getWorkspaceSettings(workspaceId)
      .then((settings) => {
        if (cancelled) return;
        setOptions(settings?.projectOptions ?? DEFAULT_PROJECT_OPTIONS);
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const getStatus = (id: string) => options.statuses.find((s) => s.id === id) ?? options.statuses[0];
  const getPriority = (id: string) => options.priorities.find((p) => p.id === id) ?? options.priorities[0];

  return { options, isLoading, getStatus, getPriority };
}
