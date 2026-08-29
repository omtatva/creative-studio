"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { createWorkspace, isSlugAvailable } from "@/services/workspaceService";
import { startTrial } from "@/services/billingService";
import { CreateWorkspacePayload } from "@/types/workspace.types";
import { ROUTES } from "@/lib/constants/routes";

/**
 * UI-facing workspace hook: wires the workspace-creation form to
 * `workspaceService.createWorkspace`, handles slug-availability
 * checks and redirect-on-success.
 */
export function useWorkspace() {
  const router = useRouter();
  const { firebaseUser, refreshProfile } = useAuthContext();
  const { workspace, workspaceId, isLoading } = useWorkspaceContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkSlug(slug: string) {
    return isSlugAvailable(slug);
  }

  async function create(payload: CreateWorkspacePayload, options?: { redirectOnSuccess?: boolean }): Promise<string | null> {
    if (!firebaseUser) {
      setError("You must be signed in to create a workspace.");
      return null;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const available = await isSlugAvailable(payload.slug);
      if (!available) {
        setError("That workspace URL is already taken.");
        return null;
      }
      const newWorkspaceId = await createWorkspace(
        firebaseUser.uid,
        firebaseUser.email ?? "",
        firebaseUser.displayName ?? "",
        firebaseUser.photoURL,
        payload
      );
      // Best-effort: a brand-new workspace should still exist even if
      // starting its trial fails for some reason (network blip, etc.)
      // — never fail workspace creation itself over this.
      await startTrial(newWorkspaceId).catch((err) => console.error("[useWorkspace] startTrial failed (workspace still created):", err));
      await refreshProfile();
      if (options?.redirectOnSuccess !== false) {
        router.push(ROUTES.dashboard);
      }
      return newWorkspaceId;
    } catch (err) {
      const firebaseErr = err as { code?: string; message?: string; stack?: string };
      console.error("[useWorkspace] createWorkspace failed:", err);
      console.error("[useWorkspace] error.code:", firebaseErr?.code);
      console.error("[useWorkspace] error.message:", firebaseErr?.message);
      console.error("[useWorkspace] error.stack:", firebaseErr?.stack);
      setError(
        firebaseErr?.code
          ? `${firebaseErr.code}: ${firebaseErr.message ?? "Could not create workspace"}`
          : "Could not create workspace. Please try again."
      );
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { workspace, workspaceId, isLoading, isSubmitting, error, checkSlug, create };
}
