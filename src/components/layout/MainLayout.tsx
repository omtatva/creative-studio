"use client";

import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorState } from "@/components/shared/ErrorState";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";

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

  return (
    <ProtectedRoute>
      {!isWorkspaceLoading && workspaceError ? (
        <div className="flex min-h-screen items-center justify-center p-6">
          <ErrorState title="Couldn't load your workspace" message={workspaceError} onRetry={refreshWorkspace} />
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
