"use client";

import { useMemo } from "react";
import { useFiles } from "./useFiles";
import { useTasks } from "./useTasks";
import { useReviews } from "./useReviews";

export interface ProjectMetrics {
  fileCount: number;
  taskCount: number;
  pendingReviewCount: number;
}

const EMPTY_METRICS: ProjectMetrics = { fileCount: 0, taskCount: 0, pendingReviewCount: 0 };

/**
 * Real, workspace-wide counts per project — for the Projects grid's
 * file/task/pending-review counts. Reuses the same realtime hooks
 * Files/Tasks/Reviews already use (one subscription each, regardless
 * of project count) rather than firing a query per card, then
 * aggregates client-side. No counter fields are added to the Project
 * doc — nothing here is fabricated, every number traces back to a
 * real Firestore doc already fetched elsewhere in the app.
 */
export function useProjectMetrics() {
  const { files, isLoading: filesLoading } = useFiles();
  const { allTasksForCounts, isLoading: tasksLoading } = useTasks();
  const { reviews, isLoading: reviewsLoading } = useReviews();

  const metricsByProject = useMemo(() => {
    const map = new Map<string, ProjectMetrics>();

    files
      .filter((f) => f.isLatestVersion)
      .forEach((file) => {
        const existing = map.get(file.projectId) ?? { ...EMPTY_METRICS };
        existing.fileCount += 1;
        map.set(file.projectId, existing);
      });

    allTasksForCounts.forEach((task) => {
      const existing = map.get(task.projectId) ?? { ...EMPTY_METRICS };
      existing.taskCount += 1;
      map.set(task.projectId, existing);
    });

    reviews
      .filter((r) => r.status === "pending")
      .forEach((review) => {
        const existing = map.get(review.projectId) ?? { ...EMPTY_METRICS };
        existing.pendingReviewCount += 1;
        map.set(review.projectId, existing);
      });

    return map;
  }, [files, allTasksForCounts, reviews]);

  return {
    metricsByProject,
    isLoading: filesLoading || tasksLoading || reviewsLoading,
    getMetrics: (projectId: string): ProjectMetrics => metricsByProject.get(projectId) ?? EMPTY_METRICS,
  };
}
