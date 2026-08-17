"use client";

import { Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";

const ROLE_VARIANT = { owner: "info", admin: "success", member: "default", viewer: "warning" } as const;

/** Workspace-wide member roster (read-only here — inviting/removing members is managed from Settings > Users, see settings/users/page.tsx). */
export function TeamPanel() {
  const { members, isLoading } = useWorkspaceMembers();

  if (!isLoading && members.length === 0) {
    return <EmptyState icon={<Users className="h-8 w-8" />} title="No team members yet" />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 w-full animate-pulse rounded-theme bg-surface-muted" />)
        : members.map((member) => (
            <Card key={member.id} className="flex items-center gap-3">
              <Avatar name={member.displayName} src={member.photoURL} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{member.displayName}</p>
                <p className="truncate text-xs text-foreground-muted">{member.email}</p>
              </div>
              <Badge variant={ROLE_VARIANT[member.role]} className="capitalize">{member.role}</Badge>
            </Card>
          ))}
    </div>
  );
}
