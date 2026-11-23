"use client";

import { useEntitlements } from "@/contexts/EntitlementsContext";
import type { UploadPolicy } from "@/lib/constants/creativeFiles";

/**
 * What an upload in the active workspace is checked against, live: the resolved per-file limit and the storage the workspace has left — both from the one
 * entitlement policy (EntitlementsContext), never a constant. A change a Super Admin saves, or the owner's own per-file choice, applies to the very next
 * upload. The server re-checks it all (/api/files/finalize, quota reservation), so this is only the fast, friendly pre-check.
 */
export function useUploadLimit(): UploadPolicy {
  return useEntitlements().uploadPolicy;
}
