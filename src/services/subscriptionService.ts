import { getDoc, getDocs } from "firebase/firestore";
import { workspaceSubscriptionDoc, allWorkspaceSubscriptionsQuery } from "@/lib/firebase/firestore";
import { WorkspaceSubscription } from "@/types/billing.types";

/**
 * Read-only client access to a workspace's subscription record — see
 * WorkspaceSubscription's doc comment in billing.types.ts. Firestore
 * rules gate this to the workspace's own owner/admin or Super Admin;
 * every write goes through a server route instead (billingClient.ts),
 * never a direct client write, so there's no write function here at
 * all.
 */
export async function getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription | null> {
  const snapshot = await getDoc(workspaceSubscriptionDoc(workspaceId));
  return snapshot.exists() ? snapshot.data() : null;
}

/** Super-Admin-only: every workspace's subscription doc at once — see allWorkspaceSubscriptionsQuery's doc comment. Workspaces that never had a subscription doc written (brand new, still on the implicit Free default) simply won't appear — callers should fall back to that workspace's own cached `plan`/`subscriptionStatus` fields. */
export async function getAllWorkspaceSubscriptions(): Promise<WorkspaceSubscription[]> {
  const snapshot = await getDocs(allWorkspaceSubscriptionsQuery());
  return snapshot.docs.map((d) => d.data());
}
