"use client";

import { ShieldAlert } from "lucide-react";
import { SuperAdminNav } from "@/components/superAdmin/SuperAdminNav";
import { useAuthContext } from "@/contexts/AuthContext";
import { isSuperAdminUser } from "@/lib/constants/itSupport";

/**
 * Gate for the entire /super-admin section. This check (reading
 * `profile.platformRole` — see itSupport.ts) is a UI convenience ONLY,
 * exactly like SettingsNav's owner/admin checks: it decides what to
 * SHOW, never what to ALLOW. The actual enforcement is server-side and
 * independent of this component entirely —
 *   - Every read here goes through Firestore rules' isSuperAdmin(),
 *     which reads the same `platformRole` field but can never be
 *     bypassed by disabling JS or editing the DOM.
 *   - Every write (billing actions) goes through verifySuperAdminAuth
 *     in an API route, which re-verifies against Firebase's own
 *     server-verified ID token — never trusting anything the browser
 *     sent.
 * So even if someone found a way to render this page's markup without
 * being Super Admin, every actual data read/write underneath it would
 * still be independently rejected.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, isLoading } = useAuthContext();

  if (isLoading) return null;

  if (!isSuperAdminUser(profile)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-foreground-muted" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Not authorized</h1>
          <p className="mt-1 text-sm text-foreground-muted">Only the platform Super Admin can view this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <SuperAdminNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
