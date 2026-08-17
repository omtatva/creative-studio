"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, CheckSquare, MessageSquareText, Paperclip, Pin, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { ProjectPriorityBadge } from "./ProjectPriorityBadge";
import { ProjectMembersAvatarGroup } from "./ProjectMembersAvatarGroup";
import { ProjectQuickActionsMenu } from "./ProjectQuickActionsMenu";
import { getProjectIcon } from "@/lib/constants/projectIconMap";
import { Project } from "@/types/project.types";
import { ProjectStatusOption, ProjectPriorityOption } from "@/types/settings.types";
import { ProjectMetrics } from "@/hooks/useProjectMetrics";
import { projectRoute } from "@/lib/constants/routes";
import { formatDueDate, timeAgo } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

/**
 * Fixed abstract cover for projects with no explicit coverImageUrl —
 * deliberately NOT keyed to the project's own accent color (that
 * used to make some cards render as a wall of whatever hue a project
 * happened to use, e.g. solid red). Same subtle indigo/violet
 * geometric treatment on every card, matching the app shell's navy
 * identity instead of each project's individual color.
 */
const PLACEHOLDER_COVER_STYLE: CSSProperties = {
  backgroundColor: "rgb(var(--color-cards))",
  backgroundImage: [
    "radial-gradient(circle at 18% 22%, rgb(99 102 241 / 0.16), transparent 42%)",
    "radial-gradient(circle at 82% 68%, rgb(139 92 246 / 0.14), transparent 48%)",
    "linear-gradient(135deg, transparent 0%, rgb(255 255 255 / 0.02) 50%, transparent 100%)",
  ].join(", "),
};

interface ProjectCardProps {
  project: Project;
  status: ProjectStatusOption | undefined;
  priority: ProjectPriorityOption | undefined;
  currentUid: string;
  metrics?: ProjectMetrics;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTogglePinned: () => void;
}

/**
 * Grid-view card. Cover priority: the project's own explicit
 * coverImageUrl (set via the project form) only — never an
 * automatically-picked uploaded asset, which previously made some
 * cards render as a wall of whatever color/image a random file
 * happened to be. No cover set → a fixed, subtle indigo/violet
 * abstract pattern (PLACEHOLDER_COVER_STYLE), the same on every
 * card regardless of the project's own accent color. File/task/
 * review counts are real aggregates from useProjectMetrics, not
 * fabricated numbers.
 */
export function ProjectCard({
  project,
  status,
  priority,
  currentUid,
  metrics,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  onToggleFavorite,
  onTogglePinned,
}: ProjectCardProps) {
  const Icon = getProjectIcon(project.icon);
  const isPinned = project.pinnedBy.includes(currentUid);
  const isFavorited = project.favoritedBy.includes(currentUid);

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
    >
      <Link href={projectRoute(project.id)}>
        <Card noPadding className="group overflow-hidden border-border transition-colors hover:border-primary/30">
          <div className="relative h-36 w-full overflow-hidden">
            {project.coverImageUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url(${project.coverImageUrl})` }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105" style={PLACEHOLDER_COVER_STYLE}>
                <Icon className="h-10 w-10 text-foreground-muted/25" />
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

            <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-theme bg-cards/90 text-foreground shadow-soft backdrop-blur-glass">
              <Icon className="h-4 w-4" style={{ color: `rgb(${project.color})` }} />
            </div>

            <div className="absolute right-3 top-3 flex items-center gap-1.5" onClick={stop}>
              <button
                onClick={onToggleFavorite}
                aria-label={isFavorited ? "Unfavorite" : "Favorite"}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full bg-cards/90 shadow-soft backdrop-blur-glass transition-colors",
                  isFavorited ? "text-warning" : "text-foreground-muted hover:text-warning"
                )}
              >
                <Star className={cn("h-3.5 w-3.5", isFavorited && "fill-current")} />
              </button>
              {isPinned && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cards/90 text-warning shadow-soft backdrop-blur-glass">
                  <Pin className="h-3.5 w-3.5 fill-current" />
                </span>
              )}
              <div className="rounded-full bg-cards/90 shadow-soft backdrop-blur-glass">
                <ProjectQuickActionsMenu
                  project={project}
                  currentUid={currentUid}
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onDelete={onDelete}
                  onToggleFavorite={onToggleFavorite}
                  onTogglePinned={onTogglePinned}
                />
              </div>
            </div>
          </div>

          <div className="p-4">
            <h3 className="truncate text-sm font-semibold text-foreground">{project.name}</h3>

            <div className="mb-3 mt-1.5 flex flex-wrap items-center gap-1.5">
              <ProjectStatusBadge status={status} />
              <ProjectPriorityBadge priority={priority} />
            </div>

            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${project.progress}%`, backgroundColor: `rgb(${project.color})` }}
              />
            </div>

            <div className="mb-2.5 flex items-center justify-between gap-2">
              <ProjectMembersAvatarGroup members={project.members} max={3} />
              {metrics && (
                <div className="flex items-center gap-2.5 text-xs text-foreground-muted">
                  <span className="flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {metrics.fileCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckSquare className="h-3 w-3" />
                    {metrics.taskCount}
                  </span>
                  {metrics.pendingReviewCount > 0 && (
                    <span className="flex items-center gap-1 text-warning">
                      <MessageSquareText className="h-3 w-3" />
                      {metrics.pendingReviewCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-foreground-muted">
              {project.dueDate ? (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDueDate(project.dueDate)}
                </span>
              ) : (
                <span />
              )}
              <span>Updated {timeAgo(project.updatedAt)}</span>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
