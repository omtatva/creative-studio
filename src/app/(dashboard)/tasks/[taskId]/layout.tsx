"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { TaskDetailsProvider, useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { TaskDetailsHeader } from "@/components/tasks/details/TaskDetailsHeader";
import { TaskDetailsNav } from "@/components/tasks/details/TaskDetailsNav";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import { ROUTES } from "@/lib/constants/routes";

function TaskDetailsShell({ taskId, children }: { taskId: string; children: React.ReactNode }) {
  const router = useRouter();
  const { task, isLoading, error } = useTaskDetailsContext();

  if (isLoading) return <Loader fullScreen label="Loading task..." />;

  if (error) return <ErrorState title="Couldn't load task" message={error} />;

  if (!task) {
    return (
      <ErrorState
        title="Task not found"
        message="This task doesn't exist, or it doesn't belong to your workspace."
        onRetry={() => router.push(ROUTES.tasks)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <TaskDetailsHeader />
      <TaskDetailsNav taskId={taskId} />
      {children}
    </div>
  );
}

export default function TaskDetailsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);

  return (
    <TaskDetailsProvider taskId={taskId}>
      <TaskDetailsShell taskId={taskId}>{children}</TaskDetailsShell>
    </TaskDetailsProvider>
  );
}
