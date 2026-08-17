"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

/**
 * Real workspace switcher, replacing the previous static/disabled
 * button. Reads `workspaces`/`workspaceId`/`switchWorkspace` from
 * WorkspaceContext (see that file) — no separate workspace store,
 * no duplicate membership query. Selecting another workspace calls
 * the existing `setActiveWorkspace` + `refreshProfile` under the
 * hood; every workspace-scoped hook across the app depends on
 * `workspaceId` already, so switching here cascades into every
 * module (Projects, Tasks, Board, Files, Reviews, Dashboard,
 * Activity, ...) re-subscribing to the new tenant automatically —
 * no manual "refresh each module" wiring needed.
 *
 * `variant="navbar"` (default) is the original compact pill, hidden
 * below md since the top bar is tight on mobile. `variant="sidebar"`
 * renders the same dropdown as a full-width row instead — used below
 * the wordmark in Sidebar.tsx, where it should stay visible even in
 * the mobile off-canvas drawer.
 */
export function WorkspaceSwitcher({ variant = "navbar" }: { variant?: "navbar" | "sidebar" }) {
  const router = useRouter();
  const { workspace, workspaces, isSwitching, switchWorkspace } = useWorkspaceContext();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useDismissableMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

  async function handleSelect(id: string) {
    if (id === workspace?.id) {
      setIsOpen(false);
      return;
    }
    await switchWorkspace(id);
    setIsOpen(false);
  }

  const isSidebar = variant === "sidebar";

  return (
    <div ref={ref} className={cn("relative", isSidebar ? "block w-full" : "hidden md:block")}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 text-sm font-medium text-foreground transition-colors",
          isSidebar
            ? "w-full rounded-theme bg-surface-muted/60 px-2.5 py-2 hover:bg-surface-muted"
            : "rounded-theme border border-border px-3 py-1.5 hover:bg-surface-muted"
        )}
      >
        {workspace?.companyLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={workspace.companyLogoUrl} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15">
            <Building2 className="h-3 w-3 text-primary" />
          </span>
        )}
        <span className={cn("truncate text-left", isSidebar ? "flex-1" : "max-w-[140px]")}>{workspace?.name ?? "Select workspace"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground-muted" />
      </button>

      {isOpen && (
        <div className={cn("absolute left-0 z-40 mt-2 rounded-theme border border-border bg-cards p-1.5 shadow-soft-lg", isSidebar ? "w-full min-w-[220px]" : "w-64")}>
          {workspaces.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No workspace yet</p>
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push(ROUTES.workspaceCreate);
                }}
                className="mt-1 rounded-theme bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Create Workspace
              </button>
            </div>
          ) : (
            <>
              <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Your workspaces
              </p>
              <div className="flex flex-col gap-0.5">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSelect(ws.id)}
                    disabled={isSwitching}
                    className="flex items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm text-foreground hover:bg-surface-muted disabled:opacity-50"
                  >
                    {ws.companyLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ws.companyLogoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                    {ws.id === workspace?.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
              <div className="my-1 h-px bg-border" />
            </>
          )}

          {workspaces.length > 0 && (
            <button
              onClick={() => {
                setIsOpen(false);
                router.push(ROUTES.workspaceCreate);
              }}
              className={cn("flex w-full items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm text-foreground-muted hover:bg-surface-muted")}
            >
              <Plus className="h-4 w-4" />
              Create New Workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
