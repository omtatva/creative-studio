"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getMyPendingInvites } from "@/services/inviteService";
import { inviteRoute } from "@/lib/constants/routes";
import type { WorkspaceInvite } from "@/types/workspace.types";

/**
 * Shown ONLY to a signed-in person who has no usable workspace right now but has an invitation waiting for their email — the common
 * first-sign-in case (they were invited, but signed in directly instead of opening the emailed link, or their old workspace was
 * deleted). Without this they'd see an empty app with "Create your workspace" and might create a second, separate workspace
 * instead of joining the one they were invited to. The invitation itself is still accepted on its own page, which re-checks the
 * invited email and the plan's member limit on the server.
 */
export function PendingInviteNotice() {
  const { firebaseUser } = useAuthContext();
  const { workspace, isLoading } = useWorkspaceContext();
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const email = firebaseUser?.email ?? null;

  useEffect(() => {
    if (isLoading || workspace || !email) {
      setInvites([]);
      return;
    }
    let cancelled = false;
    getMyPendingInvites(email)
      .then((list) => { if (!cancelled) setInvites(list); })
      .catch(() => { if (!cancelled) setInvites([]); });
    return () => { cancelled = true; };
  }, [isLoading, workspace, email]);

  if (invites.length === 0) return null;
  const usable = invites.filter((i) => new Date(i.expiresAt).getTime() > Date.now());

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-theme border border-primary/30 bg-primary/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-foreground">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        {usable.length > 0
          ? `You've been invited to join ${usable.map((i) => i.workspaceName).join(", ")}.`
          : "Your invitation has expired. Ask the workspace admin to send a new one."}
      </p>
      {usable[0] && (
        <Link href={inviteRoute(usable[0].id)} className="shrink-0 font-medium text-primary hover:underline">
          Review invitation
        </Link>
      )}
    </div>
  );
}
