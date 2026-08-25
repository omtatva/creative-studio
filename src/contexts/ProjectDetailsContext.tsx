"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProject } from "@/hooks/useProject";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useProjectMembership } from "@/hooks/useProjectMembership";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useAuthContext } from "@/contexts/AuthContext";
import { isItSupportUser } from "@/lib/constants/itSupport";
import { Project } from "@/types/project.types";
import { ProjectOptionsSettings } from "@/types/settings.types";

/**
 * Scoped (not app-wide) context for the /projects/[projectId]/*
 * route tree — loads the project + workspace project-options ONCE
 * in the layout, so Overview/Members/Settings/etc. tabs share one
 * realtime subscription instead of each re-querying Firestore.
 *
 * Also the SINGLE choke point that authorizes access to a project's
 * detail routes: `hasAccess` is true for a workspace owner/admin, the
 * IT Support account, or anyone with a `project_members` record for
 * this project — everyone else gets `hasAccess === false`, which
 * layout.tsx renders as a Not Found/Access Denied state instead of
 * `children`, protecting all 10 nested routes (overview, board,
 * files, reviews, members, settings, tasks, workspace, activity, and
 * the base page) from a single change. This is a UI convenience only
 * — the real enforcement is firestore.rules' `canReadProject`, which
 * a user can't route around by editing this file client-side.
 */
interface ProjectDetailsContextValue {
  project: Project | null;
  isLoading: boolean;
  error: string | null;
  options: ProjectOptionsSettings;
  isLoadingOptions: boolean;
  hasAccess: boolean | null; // null while still resolving
}

const ProjectDetailsContext = createContext<ProjectDetailsContextValue | undefined>(undefined);

export function ProjectDetailsProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { project, isLoading, error } = useProject(projectId);
  const { options, isLoading: isLoadingOptions } = useProjectOptions();
  const { canManageWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  const { firebaseUser } = useAuthContext();
  const { membership, isLoading: isLoadingMembership } = useProjectMembership(projectId);

  const isResolvingAccess = isLoading || isLoadingRole || isLoadingMembership;
  const hasAccess = isResolvingAccess
    ? null
    : Boolean(project) && (canManageWorkspace || isItSupportUser(firebaseUser) || membership !== null);

  return (
    <ProjectDetailsContext.Provider value={{ project, isLoading, error, options, isLoadingOptions, hasAccess }}>
      {children}
    </ProjectDetailsContext.Provider>
  );
}

export function useProjectDetailsContext(): ProjectDetailsContextValue {
  const ctx = useContext(ProjectDetailsContext);
  if (!ctx) throw new Error("useProjectDetailsContext must be used within ProjectDetailsProvider");
  return ctx;
}
