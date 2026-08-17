"use client";

import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { ProjectTasksPanel } from "@/components/tasks/ProjectTasksPanel";

/**
 * Integration point between the Projects and Tasks modules. The
 * project is already loaded by ProjectDetailsProvider (see
 * projects/[projectId]/layout.tsx) — this just reads its id from
 * that shared context and hands off to ProjectTasksPanel, which is
 * the exact same task list/board logic the global /tasks page uses,
 * scoped to this one project.
 */
export default function ProjectTasksPage() {
  const { project } = useProjectDetailsContext();
  if (!project) return null;
  return <ProjectTasksPanel projectId={project.id} />;
}
