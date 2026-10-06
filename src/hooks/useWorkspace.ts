"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { createWorkspace, isSlugAvailable } from "@/services/workspaceService";
import { startTrial, resyncBillingCache } from "@/services/billingService";
import { DEFAULT_PLAN } from "@/lib/constants/planLimits";
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

      // The plan picked on /pricing decides what happens next. Only a
      // default/explicit-Free signup gets the automatic 7-day Pro
      // trial. An explicit Pro/Business pick gets NO trial and — just
      // as important — NO checkout, purchase request, or email here:
      // createWorkspace() already left the workspace in the
      // `pending_payment` state with the plan in `pendingPlan` (Free
      // entitlements, nothing paid), and that selection alone is not a
      // purchase. The customer is sent to /billing/upgrade, and a
      // purchase request exists only once they click "Continue to
      // Payment" there (see useChoosePlan → /api/billing/checkout).
      // Enterprise has no self-serve checkout at all — Contact Sales is
      // the only path, same as everywhere else in the app.
      const requestedPlan = payload.plan ?? DEFAULT_PLAN;
      if (requestedPlan === DEFAULT_PLAN) {
        // Best-effort: a brand-new workspace should still exist even if
        // starting its trial fails (network blip, etc.) — never fail
        // workspace creation itself over this.
        await startTrial(newWorkspaceId).catch((err) => console.error("[useWorkspace] startTrial failed (workspace still created):", err));
      } else {
        // No trial and no checkout — but the workspace doc's billing
        // display cache (`limits` in particular, which firestore.rules
        // can't validate at creation) was written by this client, so
        // have the server overwrite it with the authoritative Free
        // value. Records nothing, charges nothing, creates no request.
        await resyncBillingCache(newWorkspaceId).catch((err) => console.error("[useWorkspace] billing cache resync failed (workspace still created):", err));
      }

      await refreshProfile();
      if (options?.redirectOnSuccess !== false) {
        if (requestedPlan === "enterprise") {
          router.push("/pricing#contact-sales");
        } else if (requestedPlan !== DEFAULT_PLAN) {
          router.push(`${ROUTES.billingUpgrade}?plan=${requestedPlan}`);
        } else {
          router.push(ROUTES.dashboard);
        }
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
