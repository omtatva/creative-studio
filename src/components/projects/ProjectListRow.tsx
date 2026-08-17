"use client";

import Link from "next/link";
import { Calendar, CheckSquare, MessageSquareText, Paperclip, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { ProjectPriorityBadge } from "./ProjectPriorityBadge";
import { ProjectMembersAvatarGroup } from "./ProjectMembersAvatarGroup";
import { ProjectQuickActionsMenu } from "./ProjectQuickActionsMenu";
import { getProjectIcon } from "@/lib/constants/projectIconMap";
import { Project } from "@/types/project.types";
import { ProjectStatusOption, ProjectPriorityOption } from "@/types/settings.types";
import { ProjectMetrics } from "@/hooks/useProjectMetrics";
import { projectRoute } from "@/lib/constants/routes";
import { formatDueDate } from "@/lib/utils/date";

interface ProjectListRowProps {
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

/** Table-style row for List view — same actions/data as ProjectCard, denser layout, plus Owner/Files/Tasks/Reviews columns. */
export function ProjectListRow(props: ProjectListRowProps) {
  const { project, status, priority, currentUid, metrics } = props;
  const Icon = getProjectIcon(project.icon);
  const isPinned = project.pinnedBy.includes(currentUid);
  const owner = project.members.find((m) => m.uid === project.ownerId);

  return (
    <Link href={projectRoute(project.id)}>
      <div className="grid grid-cols-[1.6fr_auto_auto_auto_auto_auto_auto_auto_auto] items-center gap-4 rounded-theme border border-border bg-surface px-4 py-3 transition-colors hover:border-primary/40 hover:bg-surface-muted">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme"
            style={{ backgroundColor: `rgb(${project.color} / 0.12)` }}
          >
            <Icon className="h-4.5 w-4.5" style={{ color: `rgb(${project.color})` }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
              {isPinned && <Pin className="h-3 w-3 shrink-0 fill-current text-warning" />}
            </div>
            <p className="truncate text-xs text-foreground-muted">{project.description || "No description"}</p>
          </div>
        </div>

        <ProjectStatusBadge status={status} />
        <ProjectPriorityBadge priority={priority} />

        {owner ? (
          <div className="flex items-center gap-1.5" title={owner.displayName}>
            <Avatar name={owner.displayName} src={owner.photoURL} size="sm" />
            <span className="hidden max-w-[90px] truncate text-xs text-foreground-muted lg:inline">{owner.displayName}</span>
          </div>
        ) : (
          <span className="text-xs text-foreground-muted">—</span>
        )}

        <div className="hidden w-24 items-center gap-2 md:flex">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full" style={{ width: `${project.progress}%`, backgroundColor: `rgb(${project.color})` }} />
          </div>
          <span className="shrink-0 text-xs text-foreground-muted">{project.progress}%</span>
        </div>

        <span className="hidden items-center gap-1 text-xs text-foreground-muted lg:flex" title="Files">
          <Paperclip className="h-3.5 w-3.5" />
          {metrics?.fileCount ?? "—"}
        </span>

        <span className="hidden items-center gap-1 text-xs text-foreground-muted lg:flex" title="Tasks">
          <CheckSquare className="h-3.5 w-3.5" />
          {metrics?.taskCount ?? "—"}
        </span>

        <span className="hidden items-center gap-1 text-xs text-foreground-muted xl:flex" title="Pending reviews">
          <MessageSquareText className="h-3.5 w-3.5" />
          {metrics?.pendingReviewCount ?? "—"}
        </span>

        <ProjectMembersAvatarGroup members={project.members} max={3} />

        <span className="hidden items-center gap-1 text-xs text-foreground-muted xl:flex">
          {project.dueDate ? (
            <>
              <Calendar className="h-3.5 w-3.5" />
              {formatDueDate(project.dueDate)}
            </>
          ) : (
            "No due date"
          )}
        </span>

        <ProjectQuickActionsMenu {...props} />
      </div>
    </Link>
  );
}
