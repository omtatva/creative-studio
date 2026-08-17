"use client";

import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { CreativeWorkspaceTab } from "@/components/creative/CreativeWorkspaceTab";

export default function ProjectCreativeWorkspacePage() {
  const { project } = useProjectDetailsContext();
  if (!project) return null;
  return <CreativeWorkspaceTab projectId={project.id} />;
}
