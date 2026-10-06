"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Loader } from "@/components/ui/Loader";
import { useAuthContext } from "@/contexts/AuthContext";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Route/page guard for WORKSPACE MEMBER & ACCESS ADMINISTRATION (Users,
 * Roles, Access Control) — platform Super Admin only, using the
 * existing Super Admin mechanism (the server-synced `platformRole`
 * behind isSuperAdminUser), not a second role system.
 *
 * Wrap a page's CONTENT component with this (rather than checking
 * inside it) so none of its data hooks mount for someone who can't use
 * the page — a direct URL visit by an owner/admin/employee renders the
 * notice and never fetches or exposes the admin UI. This is the
 * client-side half of route protection (the app's existing pattern is
 * per-page checks); the actual security boundary is server-side — the
 * member/invite routes and firestore.rules reject non-Super-Admin
 * callers regardless of what the UI shows.
 */
export function SuperAdminOnly({ title, children }: { title: string; children: React.ReactNode }) {
  const { profile, isLoading } = useAuthContext();

  if (isLoading) return <Loader label="Loading..." />;

  if (!isSuperAdminUser(profile)) {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <ShieldAlert className="h-5 w-5 text-warning" />
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <p className="text-sm text-foreground-muted">
          Workspace member and access administration is handled by the platform administrator. Contact support if you need to add people or change roles.
        </p>
        <Link href={ROUTES.team} className="text-sm font-medium text-primary hover:underline">
          View your team
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
