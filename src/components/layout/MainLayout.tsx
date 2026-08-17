"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorState } from "@/components/shared/ErrorState";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useThemeContext } from "@/contexts/ThemeContext";
import { applyAppShellTheme, clearAppShellTheme } from "@/lib/constants/appShellTheme";

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
 */
export function MainLayout({ children }: { children: ReactNode }) {
  const { error: workspaceError, isLoading: isWorkspaceLoading, refreshWorkspace } = useWorkspaceContext();
  const { theme } = useThemeContext();
  const shellRef = useRef<HTMLDivElement>(null);

  // Applies the app-shell's deeper navy/violet refinement (see
  // appShellTheme.ts) on this one element only — scoped so the public
  // landing page and /login /signup, which share the same global
  // --color-* variables, never see it. Skips any role a workspace has
  // actually customized via Settings > Branding, so per-workspace
  // theming still works exactly as before inside the shell too.
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    applyAppShellTheme(el, theme.colors);
    return () => clearAppShellTheme(el);
  }, [theme.colors]);

  return (
    <ProtectedRoute>
      {!isWorkspaceLoading && workspaceError ? (
        <div className="flex min-h-screen items-center justify-center p-6">
          <ErrorState title="Couldn't load your workspace" message={workspaceError} onRetry={refreshWorkspace} />
        </div>
      ) : (
        <div ref={shellRef} className="flex min-h-screen bg-background">
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
