import Link from "next/link";
import { FolderPlus, FolderX, SearchX, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ProjectSection } from "@/types/project.types";
import { ROUTES } from "@/lib/constants/routes";

interface ProjectEmptyStateProps {
  section: ProjectSection;
  hasSearchOrFilters: boolean;
  onCreateProject: () => void;
  onClearSearch: () => void;
}

/** Message/action varies by section and whether a search/filter is active, so the empty state always explains *why* the list is empty. */
export function ProjectEmptyState({ section, hasSearchOrFilters, onCreateProject, onClearSearch }: ProjectEmptyStateProps) {
  if (hasSearchOrFilters) {
    return (
      <EmptyState
        icon={<SearchX className="h-9 w-9" />}
        title="No projects match your search"
        description="Try a different keyword or clear your filters."
        action={
          <Button size="sm" variant="outline" onClick={onClearSearch}>
            Clear search & filters
          </Button>
        }
        className="py-20"
      />
    );
  }

  if (section === "archived") {
    return (
      <EmptyState
        icon={<FolderX className="h-9 w-9" />}
        title="No archived projects"
        description="Projects you archive will show up here."
        className="py-20"
      />
    );
  }

  if (section === "favorites") {
    return (
      <EmptyState
        icon={<FolderX className="h-9 w-9" />}
        title="No favorite projects yet"
        description="Star a project from its quick actions menu to pin it here."
        className="py-20"
      />
    );
  }

  if (section === "pinned") {
    return (
      <EmptyState
        icon={<FolderX className="h-9 w-9" />}
        title="No pinned projects yet"
        description="Pin a project from its quick actions menu to keep it at the top."
        className="py-20"
      />
    );
  }

  return (
    <EmptyState
      icon={<FolderPlus className="h-9 w-9" />}
      title="Your creative workspace starts here."
      description="Create your first project and bring your team, files and reviews together."
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={onCreateProject}>
            New Project
          </Button>
          <Link href={ROUTES.aiStudio}>
            <Button size="sm" variant="outline">
              <Sparkles className="h-4 w-4" />
              Explore AI Studio
            </Button>
          </Link>
        </div>
      }
      className="py-20"
    />
  );
}
