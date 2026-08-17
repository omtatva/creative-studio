"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProject } from "@/hooks/useProject";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { Project } from "@/types/project.types";
import { ProjectOptionsSettings } from "@/types/settings.types";

/**
 * Scoped (not app-wide) context for the /projects/[projectId]/*
 * route tree — loads the project + workspace project-options ONCE
 * in the layout, so Overview/Members/Settings/etc. tabs share one
 * realtime subscription instead of each re-querying Firestore.
 */
interface ProjectDetailsContextValue {
  project: Project | null;
  isLoading: boolean;
  error: string | null;
  options: ProjectOptionsSettings;
  isLoadingOptions: boolean;
}

const ProjectDetailsContext = createContext<ProjectDetailsContextValue | undefined>(undefined);

export function ProjectDetailsProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { project, isLoading, error } = useProject(projectId);
  const { options, isLoading: isLoadingOptions } = useProjectOptions();

  return (
    <ProjectDetailsContext.Provider value={{ project, isLoading, error, options, isLoadingOptions }}>
      {children}
    </ProjectDetailsContext.Provider>
  );
}

export function useProjectDetailsContext(): ProjectDetailsContextValue {
  const ctx = useContext(ProjectDetailsContext);
  if (!ctx) throw new Error("useProjectDetailsContext must be used within ProjectDetailsProvider");
  return ctx;
}
