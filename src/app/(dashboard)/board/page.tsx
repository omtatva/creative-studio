"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProjectIcon } from "@/lib/constants/projectIconMap";
import { projectRoute } from "@/lib/constants/routes";

/**
 * Top-level "Board" nav destination. A board belongs to one project
 * (see boardService.getOrCreateBoard), so this is a project picker
 * that hands off to that project's real board at
 * /projects/[id]/board — reuses useProjects rather than a parallel
 * project-fetching query.
 */
export default function BoardPickerPage() {
  const { allProjectsForCounts: projects, isLoading } = useProjects();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Board</h1>
        <p className="mt-1 text-sm text-foreground-muted">Pick a project to open its Kanban board.</p>
      </div>

      {!isLoading && projects.length === 0 ? (
        <EmptyState icon={<LayoutDashboard className="h-9 w-9" />} title="No projects yet" description="Create a project first to get a board." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 w-full animate-pulse rounded-theme bg-surface-muted" />)
            : projects.map((project) => {
                const Icon = getProjectIcon(project.icon);
                return (
                  <Link key={project.id} href={projectRoute(project.id, "board")}>
                    <Card className="flex items-center gap-3 transition-transform hover:-translate-y-0.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-theme" style={{ backgroundColor: `rgb(${project.color} / 0.12)` }}>
                        <Icon className="h-5 w-5" style={{ color: `rgb(${project.color})` }} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-foreground-muted">Open board</p>
                      </div>
                    </Card>
                  </Link>
                );
              })}
        </div>
      )}
    </div>
  );
}
