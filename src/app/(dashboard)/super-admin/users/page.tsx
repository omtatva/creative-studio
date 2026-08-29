"use client";

import { useEffect, useState } from "react";
import { Users as UsersIcon, ShieldCheck } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAllUsers } from "@/services/authService";
import { timeAgo } from "@/lib/utils/date";
import type { AppUser } from "@/types/user.types";

/** Super Admin > Users — every account on the platform, read-only (no edit actions yet — see the implementation report's disclosed gaps). */
export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<AppUser[] | null>(null);

  useEffect(() => {
    getAllUsers()
      .then((list) => setUsers(list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))))
      .catch((err) => {
        console.error("[super-admin/users] failed to load users:", err);
        setUsers([]);
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-foreground-muted">Every account on the platform, across every workspace.</p>
      </div>

      <SettingsSection title={`${users?.length ?? "..."} user${users?.length === 1 ? "" : "s"}`}>
        {!users ? (
          <Loader label="Loading users..." />
        ) : users.length === 0 ? (
          <EmptyState icon={<UsersIcon className="h-8 w-8" />} title="No users yet" description="Nobody has signed up on the platform yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((user) => (
              <div key={user.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-theme border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{user.displayName || "(no name)"}</p>
                    {user.platformRole === "super_admin" && (
                      <Badge variant="info" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> Super Admin
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-foreground-muted">{user.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-foreground-muted">
                  <span>Joined {timeAgo(user.createdAt)}</span>
                  <Badge variant={user.onboardingComplete ? "success" : "default"}>
                    {user.onboardingComplete ? "Onboarded" : "Pending"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
