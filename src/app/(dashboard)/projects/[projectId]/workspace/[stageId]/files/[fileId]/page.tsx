"use client";

import { use, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { useFiles } from "@/hooks/useFiles";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import { ReviewWorkspace } from "@/components/creative/review/ReviewWorkspace";
import { groupAssetVersions } from "@/lib/utils/assetVersions";
import { projectRoute } from "@/lib/constants/routes";

/**
 * The full-screen Creative Review Workspace —
 * /projects/[projectId]/workspace/[stageId]/files/[fileId].
 *
 * Deliberately nested under the EXISTING projects/[projectId] route
 * (reusing ProjectDetailsProvider from that segment's layout.tsx,
 * see contexts/ProjectDetailsContext.tsx) rather than living outside
 * the (dashboard) route group — a sibling top-level `/projects/...`
 * tree would collide with the existing one at the URL level. Instead
 * this page renders as a `fixed inset-0` full-viewport layer that
 * visually covers the inherited sidebar/navbar/project-tabs chrome,
 * so it behaves like a dedicated full-screen application while still
 * being a real, linkable, refreshable Next.js route.
 */
export default function FileReviewPage({
  params,
}: {
  params: Promise<{ projectId: string; stageId: string; fileId: string }>;
}) {
  const { projectId, stageId, fileId } = use(params);
  const router = useRouter();
  const { project, isLoading: isLoadingProject } = useProjectDetailsContext();
  const { files, isLoading: isLoadingFiles } = useFiles(projectId);

  // Locks the underlying dashboard page's scroll while this full-screen
  // layer is mounted — the overlay already visually covers it, this
  // just stops stray wheel/touch scroll from reaching it at the edges.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const groups = useMemo(() => groupAssetVersions(files), [files]);
  const group = groups.find((g) => g.versions.some((v) => v.id === fileId)) ?? null;

  if (isLoadingProject || isLoadingFiles) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <Loader fullScreen label="Loading review workspace..." />
      </div>
    );
  }

  if (!project || !group) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
        <ErrorState
          title="File not found"
          message="This file doesn't exist, or it doesn't belong to this project."
          onRetry={() => router.push(projectRoute(projectId, "workspace"))}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <ReviewWorkspace projectId={projectId} stageId={stageId} group={group} activeFileId={fileId} />
    </div>
  );
}
