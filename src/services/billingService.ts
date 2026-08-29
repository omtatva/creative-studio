import { getCurrentUser } from "@/lib/firebase/auth";
import { SubscriptionStatus, WorkspaceSubscription } from "@/types/billing.types";
import { WorkspacePlan, WorkspacePlanLimits } from "@/types/workspace.types";

/**
 * Client-facing billing abstraction — every "change what this
 * workspace is subscribed to" action goes through one of these, never
 * a direct Firestore write (workspaces/{id}/billing/subscription is
 * admin-SDK-write-only — see firestore.rules). Mirrors the shape
 * Section 9 asked for (createCheckoutSession/handleWebhook/
 * getSubscription/cancelSubscription/changePlan) — handleWebhook has
 * no client-side function at all, since a webhook is server-to-server
 * only (see /api/billing/webhook).
 */

interface ActionResult<T> {
  ok: boolean;
  error?: string;
  violations?: string[];
  data?: T;
}

async function callBillingApi<T>(path: string, body: unknown): Promise<ActionResult<T>> {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const idToken = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: data?.error ?? "Something went wrong.", violations: data?.violations };
  }
  return { ok: true, data };
}

/** First-time plan choice on a free/incomplete subscription — see /api/billing/checkout's doc comment for what "checkoutUrl: null" means right now. */
export function createCheckoutSession(workspaceId: string, planId: Exclude<WorkspacePlan, "enterprise">) {
  return callBillingApi<{ checkoutUrl: string | null; subscription: WorkspaceSubscription; message: string }>(
    "/api/billing/checkout",
    { workspaceId, planId }
  );
}

/** Changing an already-active subscription's plan — rejects with `violations` if the new plan can't fit current usage (see change-plan route). */
export function changePlan(workspaceId: string, planId: Exclude<WorkspacePlan, "enterprise">) {
  return callBillingApi<{ subscription: WorkspaceSubscription; message: string }>("/api/billing/change-plan", { workspaceId, planId });
}

/** Super-Admin-only: manually confirms a Free/Pro/Business subscription as active (stand-in for a webhook until a real provider is connected). */
export function activatePlanManually(workspaceId: string, planId: WorkspacePlan) {
  return callBillingApi<{ subscription: WorkspaceSubscription }>("/api/billing/activate-plan", { workspaceId, planId });
}

/** Super-Admin-only: activates Enterprise for a workspace after closing a specific sales lead — see Section 17. */
export function activateEnterpriseSubscription(leadId: string, workspaceId: string, customEntitlements?: Partial<WorkspacePlanLimits>) {
  return callBillingApi<{ subscription: WorkspaceSubscription }>("/api/billing/activate-enterprise", { leadId, workspaceId, customEntitlements });
}

/** Super-Admin-only: force a subscription to active/paused/canceled directly — Suspend/Reactivate/Cancel on Super Admin > Billing, independent of any payment provider. */
export function setSubscriptionStatus(workspaceId: string, status: Extract<SubscriptionStatus, "active" | "paused" | "canceled">) {
  return callBillingApi<{ subscription: WorkspaceSubscription }>("/api/billing/set-status", { workspaceId, status });
}

/** Called once, right after a brand-new workspace is created (see useWorkspace.ts) — starts its 7-day Pro trial. Best-effort: a failure here should never block workspace creation itself. */
export function startTrial(workspaceId: string) {
  return callBillingApi<{ subscription: WorkspaceSubscription }>("/api/billing/start-trial", { workspaceId });
}
