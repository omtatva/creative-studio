"use client";

import { Calendar, CheckSquare, FileText, Activity, Users, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, isOverdue } from "@/lib/utils/date";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";

/**
 * Overview tab: progress/completion, task summary, recent files,
 * recent activity, members, upcoming deadlines. Task/file/activity
 * data has no backing collection yet in this module's scope (see
 * Tasks/Board/Files/Reviews/Activity tabs) so those cards render an
 * honest empty state rather than fabricated numbers.
 */
export function ProjectOverviewTab() {
  const { project } = useProjectDetailsContext();
  if (!project) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Completion</CardTitle>
          </CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface-muted">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgb(var(--color-border))" strokeWidth="8" />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke={`rgb(${project.color})`}
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 34}
                  strokeDashoffset={2 * Math.PI * 34 * (1 - project.progress / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-sm font-semibold text-foreground">{project.progress}%</span>
            </div>
            <div className="text-sm text-foreground-muted">
              <p className="font-medium text-foreground">
                {project.progress === 100 ? "Project complete" : "In progress"}
              </p>
              <p>Started {project.startDate ? formatDate(project.startDate) : "—"}</p>
              <p className={isOverdue(project.dueDate) && project.progress < 100 ? "text-red-500" : ""}>
                Due {formatDate(project.dueDate)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Summary</CardTitle>
            <CheckSquare className="h-4 w-4 text-foreground-muted" />
          </CardHeader>
          <EmptyState title="No tasks yet" description="Tasks for this project will summarize here once the Tasks module is connected." />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Files</CardTitle>
            <FileText className="h-4 w-4 text-foreground-muted" />
          </CardHeader>
          <EmptyState title="No files yet" description="Files uploaded to this project will show up here." />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <Activity className="h-4 w-4 text-foreground-muted" />
          </CardHeader>
          <EmptyState title="No activity yet" description="Changes to this project will be logged here." />
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <Users className="h-4 w-4 text-foreground-muted" />
          </CardHeader>
          <div className="flex flex-col gap-2.5">
            {project.members.map((member) => (
              <div key={member.uid} className="flex items-center gap-2.5">
                <Avatar name={member.displayName} src={member.photoURL} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{member.displayName}</p>
                  <p className="truncate text-xs capitalize text-foreground-muted">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Deadline</CardTitle>
            <Calendar className="h-4 w-4 text-foreground-muted" />
          </CardHeader>
          {project.dueDate ? (
            <div className="flex items-center gap-2">
              {isOverdue(project.dueDate) && project.progress < 100 && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <p className="text-sm text-foreground">{formatDate(project.dueDate)}</p>
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">No due date set.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
