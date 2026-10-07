"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeFeatureGrants } from "@/services/featureAccessService";
import { resolveFeatureGrant, type FeatureGrants } from "@/lib/constants/featurePermissions";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";

/**
 * UI half of the Feature Access matrix: `can("projects.create")` answers
 * with the SAME resolveFeatureGrant the server routes and Firestore rules
 * mirror. Purely a convenience — hiding a button is never the security
 * boundary (the routes/rules re-check). Super Admin always passes (rules
 * and routes never deny them). While the matrix or role is still loading,
 * or if the read fails, it resolves from registry defaults, i.e. today's
 * behaviour, so nothing flickers away or locks out on a transient error.
 */
export function useFeatureAccess() {
  const { role, isSuperAdmin } = useCurrentMemberRole();
  const [grants, setGrants] = useState<FeatureGrants | null>(null);

  useEffect(() => {
    return subscribeFeatureGrants(
      (g) => setGrants(g),
      (err) => console.error("[useFeatureAccess] couldn't read feature access — using defaults:", err)
    );
  }, []);

  const can = useCallback(
    (permissionId: string) => {
      if (isSuperAdmin) return true;
      return resolveFeatureGrant(grants, role ?? "member", permissionId);
    },
    [grants, role, isSuperAdmin]
  );

  return { can, grants };
}
