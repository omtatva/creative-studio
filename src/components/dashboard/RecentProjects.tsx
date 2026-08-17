"use client";

import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { ProjectMembersAvatarGroup } from "@/components/projects/ProjectMembersAvatarGroup";
import { getProjectIcon } from "@/lib/constants/projectIconMap";
import { useProjects } from "@/hooks/useProjects";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { projectRoute, ROUTES } from "@/lib/constants/routes";

/** Now backed by the live, workspace-scoped project list (see useProjects) instead of a static placeholder. */
export function RecentProjects() {
  const { allProjectsForCounts, isLoading } = useProjects();
  const { options } = useProjectOptions();
  const recent = allProjectsForCounts.filter((p) => !p.isArchived).slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Projects</CardTitle>
        {recent.length > 0 && (
          <Link href={ROUTES.projects} className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        )}
      </CardHeader>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-theme bg-surface-muted" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" />}
          title="No projects yet"
          description="Projects you create or join will show up here."
          action={
            <Link href={ROUTES.projects}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {recent.map((project) => {
            const Icon = getProjectIcon(project.icon);
            const status = options.statuses.find((s) => s.id === project.statusId);
            return (
              <Link
                key={project.id}
                href={projectRoute(project.id)}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme"
                  style={{ backgroundColor: `rgb(${project.color} / 0.12)` }}
                >
                  <Icon className="h-4.5 w-4.5" style={{ color: `rgb(${project.color})` }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                  <ProjectStatusBadge status={status} />
                </div>
                <ProjectMembersAvatarGroup members={project.members} max={3} />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
