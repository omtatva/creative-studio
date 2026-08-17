"use client";

import Link from "next/link";
import { FolderPlus, Paperclip, Users, Settings } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useProjects } from "@/hooks/useProjects";
import { ROUTES, projectRoute } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";

/**
 * "New Project" deep-links into the actual creation flow
 * (/projects?new=1 auto-opens ProjectFormModal — see projects/page.tsx)
 * rather than just landing on the list. "Upload File" needs a target
 * project (the workspace-wide Files view has no upload capability of
 * its own — see FilesPanel), so it routes to the most recently
 * updated project's Files tab, or is disabled with an explanation
 * when the workspace has no projects yet, instead of leading nowhere.
 */
export function QuickActions() {
  const { allProjectsForCounts, isLoading } = useProjects();
  const mostRecentProject = [...allProjectsForCounts]
    .filter((p) => !p.isArchived)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  const uploadHref = mostRecentProject ? projectRoute(mostRecentProject.id, "files") : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`${ROUTES.projects}?new=1`}
          className="flex h-auto flex-col items-center gap-2 rounded-theme border border-border py-4 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          <FolderPlus className="h-5 w-5" />
          <span className="text-xs">New Project</span>
        </Link>

        <Link
          href={ROUTES.team}
          className="flex h-auto flex-col items-center gap-2 rounded-theme border border-border py-4 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          <Users className="h-5 w-5" />
          <span className="text-xs">Team</span>
        </Link>

        {uploadHref ? (
          <Link
            href={uploadHref}
            className="flex h-auto flex-col items-center gap-2 rounded-theme border border-border py-4 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
          >
            <Paperclip className="h-5 w-5" />
            <span className="text-xs">Upload File</span>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title={isLoading ? "Loading projects..." : "Create a project first"}
            className={cn(
              "flex h-auto cursor-not-allowed flex-col items-center gap-2 rounded-theme border border-border py-4 text-foreground-muted opacity-40"
            )}
          >
            <Paperclip className="h-5 w-5" />
            <span className="text-xs">Upload File</span>
          </button>
        )}

        <Link
          href={ROUTES.settingsWorkspace}
          className="flex h-auto flex-col items-center gap-2 rounded-theme border border-border py-4 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          <Settings className="h-5 w-5" />
          <span className="text-xs">Workspace Settings</span>
        </Link>
      </div>
    </Card>
  );
}
