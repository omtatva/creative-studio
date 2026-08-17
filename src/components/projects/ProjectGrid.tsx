import { Project } from "@/types/project.types";
import { ProjectOptionsSettings } from "@/types/settings.types";
import { ProjectMetrics } from "@/hooks/useProjectMetrics";
import { ProjectCard } from "./ProjectCard";
import { ProjectListRow } from "./ProjectListRow";
import { ProjectCardSkeleton, ProjectListRowSkeleton } from "./ProjectCardSkeleton";

interface ProjectGridProps {
  projects: Project[];
  isLoading: boolean;
  viewMode: "grid" | "list";
  options: ProjectOptionsSettings;
  currentUid: string;
  metricsByProject: Map<string, ProjectMetrics>;
  onEdit: (project: Project) => void;
  onDuplicate: (project: Project) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
  onDelete: (project: Project) => void;
  onToggleFavorite: (project: Project) => void;
  onTogglePinned: (project: Project) => void;
}

/** Switches between grid-of-cards and stacked-rows without the parent page caring which is active. */
export function ProjectGrid({
  projects,
  isLoading,
  viewMode,
  options,
  currentUid,
  metricsByProject,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  onToggleFavorite,
  onTogglePinned,
}: ProjectGridProps) {
  if (isLoading) {
    return viewMode === "grid" ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <ProjectListRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  const Component = viewMode === "grid" ? ProjectCard : ProjectListRow;
  const containerClass =
    viewMode === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "flex flex-col gap-2";

  return (
    <div className={containerClass}>
      {projects.map((project) => (
        <Component
          key={project.id}
          project={project}
          status={options.statuses.find((s) => s.id === project.statusId)}
          priority={options.priorities.find((p) => p.id === project.priorityId)}
          currentUid={currentUid}
          metrics={metricsByProject.get(project.id)}
          onEdit={() => onEdit(project)}
          onDuplicate={() => onDuplicate(project)}
          onArchive={() => onArchive(project)}
          onRestore={() => onRestore(project)}
          onDelete={() => onDelete(project)}
          onToggleFavorite={() => onToggleFavorite(project)}
          onTogglePinned={() => onTogglePinned(project)}
        />
      ))}
    </div>
  );
}
