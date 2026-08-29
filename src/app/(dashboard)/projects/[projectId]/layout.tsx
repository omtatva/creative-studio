"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ProjectDetailsProvider, useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { ProjectDetailsHeader } from "@/components/projects/details/ProjectDetailsHeader";
import { ProjectDetailsNav } from "@/components/projects/details/ProjectDetailsNav";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import { ROUTES } from "@/lib/constants/routes";

function ProjectDetailsShell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const router = useRouter();
  const { project, isLoading, error, hasAccess } = useProjectDetailsContext();

  if (isLoading || hasAccess === null) return <Loader fullScreen label="Loading project..." />;

  if (error) return <ErrorState message={error} />;

  if (!project) {
    return (
      <ErrorState
        message="This project doesn't exist, or it doesn't belong to your workspace."
        onRetry={() => router.push(ROUTES.projects)}
      />
    );
  }

  // Project exists and belongs to this workspace, but the signed-in
  // user has no project_members record for it (and isn't a workspace
  // owner/admin or Super Admin) — deliberately worded the same as the
  // "doesn't exist" case above so this can't be used to distinguish
  // "you're not allowed" from "it's not there" by probing project ids.
  if (!hasAccess) {
    return (
      <ErrorState
        message="This project doesn't exist, or it doesn't belong to your workspace."
        onRetry={() => router.push(ROUTES.projects)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ProjectDetailsHeader />
      <ProjectDetailsNav projectId={projectId} />
      {children}
    </div>
  );
}

export default function ProjectDetailsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  return (
    <ProjectDetailsProvider projectId={projectId}>
      <ProjectDetailsShell projectId={projectId}>{children}</ProjectDetailsShell>
    </ProjectDetailsProvider>
  );
}
