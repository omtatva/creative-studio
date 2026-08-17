"use client";

import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { BoardShell } from "@/components/board/BoardShell";

/**
 * Integration point between the Board module and the Projects
 * module. The project is already loaded by ProjectDetailsProvider
 * (see projects/[projectId]/layout.tsx) — this reads its id from
 * that shared context and hands off to BoardShell, which lazily
 * creates the project's board on first visit.
 */
export default function ProjectBoardPage() {
  const { project } = useProjectDetailsContext();
  if (!project) return null;
  return <BoardShell projectId={project.id} />;
}
