import { doc } from "firebase/firestore";
import { subscribeSharedDoc } from "@/lib/firebase/sharedDocSubscription";
import { db } from "@/lib/firebase/config";
import { getCurrentUser } from "@/lib/firebase/auth";
import type { FeatureGrants } from "@/lib/constants/featurePermissions";

const featureAccessRef = () => doc(db, "platform_settings", "featureAccess");

/**
 * Realtime read of the Feature Access matrix (any signed-in user — the UI
 * needs it to hide controls the server would refuse; see firestore.rules'
 * platform_settings block). `null` = never saved → registry defaults.
 * Errors are reported, not swallowed: callers fall back to defaults
 * (today's behaviour), since the server/rules are the real gate anyway.
 */
export function subscribeFeatureGrants(onGrants: (grants: FeatureGrants | null, updatedAt: string | null) => void, onError: (err: Error) => void): () => void {
  return subscribeSharedDoc<{ grants?: FeatureGrants; updatedAt?: string }>(
    featureAccessRef(),
    (data) => onGrants(data?.grants ?? null, data?.updatedAt ?? null),
    onError
  );
}

async function post(body: unknown): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/platform-settings/feature-access", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't save feature access.");
}

/** Super-Admin-only (verified server-side, not here). */
export const saveFeatureGrants = (grants: FeatureGrants) => post({ grants });
export const resetFeatureGrants = () => post({ reset: true });
