"use client";

import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { FilesPanel } from "@/components/files/FilesPanel";

export default function ProjectFilesPage() {
  const { project } = useProjectDetailsContext();
  if (!project) return null;
  return <FilesPanel projectId={project.id} />;
}
