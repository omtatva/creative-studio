"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { Loader } from "@/components/ui/Loader";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Wraps the (dashboard) route group layout. Redirects unauthenticated
 * users to /login — that's the only hard redirect here.
 *
 * A missing active workspace is intentionally NOT redirected away
 * from anymore: USER → WORKSPACE → PROJECT means a user can be
 * authenticated with zero workspaces, and the correct place to
 * resolve that is inline, on whatever workspace-dependent page they
 * land on (see NoWorkspaceState / CreateWorkspaceModal, used by the
 * Projects page), not by bouncing them to a separate route before
 * they can see anything. This also lets "New Project" open Create
 * Workspace and continue straight into the Project form afterward —
 * a hard redirect here would make that chained flow impossible.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { firebaseUser, isLoading } = useAuthContext();

  useEffect(() => {
    if (isLoading) return;
    if (!firebaseUser) {
      router.replace(ROUTES.login);
    }
  }, [isLoading, firebaseUser, router]);

  if (isLoading || !firebaseUser) {
    return <Loader fullScreen label="Loading..." />;
  }

  return <>{children}</>;
}
