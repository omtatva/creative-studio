"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useRouter, useSearchParams } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { PLAN_ORDER } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";

/**
 * Standalone route for direct-URL access (bookmarked, linked from
 * the workspace switcher's "Create New Workspace", or from the
 * Pricing → signup/login flow via ?plan=). Same form as
 * CreateWorkspaceModal — see CreateWorkspaceForm — just in this
 * page's existing chrome instead of a modal.
 */
export default function CreateWorkspacePage() {
  const { workspaceId: existingWorkspaceId } = useWorkspaceContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const initialPlan = PLAN_ORDER.includes(planParam as WorkspacePlan) ? (planParam as WorkspacePlan) : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-surface to-secondary/5 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            {existingWorkspaceId ? "Create a new workspace" : "Set up your workspace"}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">This is where your team's projects will live.</p>
        </div>

        <Card>
          <CreateWorkspaceForm onSuccess={() => router.push(ROUTES.dashboard)} initialPlan={initialPlan} />
          {existingWorkspaceId && (
            <Link href={ROUTES.dashboard} className="mt-3 block text-center text-sm text-foreground-muted hover:text-foreground">
              Cancel and go back
            </Link>
          )}
        </Card>
      </div>
    </div>
  );
}
