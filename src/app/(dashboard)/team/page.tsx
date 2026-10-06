"use client";

import { TeamPanel } from "@/components/team/TeamPanel";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";

export default function TeamPage() {
  // Read-only for everyone: this page lists who's in the workspace for
  // collaboration. Adding/removing people and changing roles is platform
  // Super Admin administration (Settings > Users, Super Admin only).
  const { isSuperAdmin } = useCurrentMemberRole();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Team</h1>
        <p className="mt-1 text-sm text-foreground-muted">{isSuperAdmin ? "Everyone in this workspace. Manage roles from Settings > Users." : "Everyone in your workspace."}</p>
      </div>
      <TeamPanel />
    </div>
  );
}
