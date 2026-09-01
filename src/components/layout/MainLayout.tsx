"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/Button";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Shell used by every authenticated route (dashboard, settings).
 * Composition: ProtectedRoute (auth gate) > Sidebar + [Navbar + page
 * content]. Kept separate from ProtectedRoute so unauthenticated
 * pages (login/signup) never mount the sidebar/navbar at all.
 *
 * If the workspace fails to load (see WorkspaceContext — e.g. the
 * doc doesn't exist, or a permission-denied on the read), every
 * page under here needs workspaceId, so this is the one place that
 * blocks and shows the real error instead of quietly rendering a
 * dashboard where every write silently fails.
 *
 * Exception: the Super Admin (see lib/constants/itSupport.ts) is a
 * cross-workspace platform identity, not a tenant member — it's
 * entirely normal for this account to have no valid `activeWorkspaceId`
 * (no workspace of its own, or one it deleted while testing). Blocking
 * it here would lock it out of the whole /super-admin section too,
 * which is the one place a broken workspace pointer doesn't matter at
 * all. So for this one account, a workspace error renders the normal
 * shell instead of the full-screen block; workspace-scoped pages it
 * navigates into still handle `workspace === null` on their own (same
 * as any other account with zero workspaces).
 *
 * Dark/light + per-workspace branding colors are applied globally by
 * ThemeContext.applyThemeToDocument on <html> — there used to be a
 * second, shell-scoped "deeper navy refinement" layer applied here on
 * top of that (see the removed appShellTheme.ts), but it unconditionally
 * forced its own fixed navy for structural tokens like --color-surface
 * whenever dark mode was on, which fought ThemeContext's per-workspace
 * hue-derived dark surfaces and always won (this element is more
 * specific than <html>). Removed rather than special-cased further —
 * ThemeContext's derivation already covers this shell correctly for
 * every palette, so a second layer had nothing left to add.
 */
export function MainLayout({ children }: { children: ReactNode }) {
  const { error: workspaceError, isLoading: isWorkspaceLoading, refreshWorkspace } = useWorkspaceContext();
  const { profile } = useAuthContext();
  const { logout, isSubmitting: isSigningOut } = useAuth();
  const isSuperAdmin = isSuperAdminUser(profile);

  return (
    <ProtectedRoute>
      {!isWorkspaceLoading && workspaceError && !isSuperAdmin ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
          <ErrorState title="Couldn't load your workspace" message={workspaceError} onRetry={refreshWorkspace} />
          {/* This screen blocks the whole app shell (sidebar/navbar,
              where sign-out normally lives) — without an escape hatch
              here, a genuinely deleted/invalid workspace pointer traps
              the account with no way to sign out or start over. */}
          <div className="flex items-center gap-3">
            <Link href={ROUTES.workspaceCreate} className="text-sm font-medium text-primary hover:underline">
              Create a new workspace
            </Link>
            <span className="text-sm text-foreground-muted">·</span>
            <Button size="sm" variant="outline" onClick={logout} isLoading={isSigningOut}>
              Sign out
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <div className="flex min-h-screen flex-1 flex-col">
            <Navbar />
            <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
