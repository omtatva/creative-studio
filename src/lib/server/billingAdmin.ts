import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { resolveEntitlements } from "@/lib/entitlements";
import { DEFAULT_PLAN } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";
import type { WorkspaceSubscription, SubscriptionStatus, BillingProvider } from "@/types/billing.types";

/**
 * Server-only (admin SDK) writes to workspaces/{id}/billing/subscription
 * — the ONLY code allowed to touch that document at all (see its
 * firestore.rules block: client write is unconditionally denied). Every
 * caller here is itself an API route that has already independently
 * verified who's asking (verifyRequestAuth + a real role/Super-Admin
 * check, or a webhook signature) — this module does the actual write,
 * not the authorization decision.
 */

function subscriptionRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription");
}

export async function getSubscriptionAdmin(workspaceId: string): Promise<WorkspaceSubscription | null> {
  const snap = await subscriptionRef(workspaceId).get();
  return snap.exists ? (snap.data() as WorkspaceSubscription) : null;
}

/**
 * Applies a subscription change (checkout confirmation, webhook event,
 * manual/Enterprise activation, plan change, cancellation) and
 * immediately re-syncs the resolved plan/limits onto
 * `workspaces/{id}` — the fast-path cache every EXISTING limit check
 * (checkWorkspaceLimit, canUseFeature, project/member creation UI, ...)
 * already reads. Both writes happen together so there's never a window
 * where the subscription doc says one thing and the cache says
 * another.
 */
export async function applySubscriptionUpdate(
  workspaceId: string,
  patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">>,
  updatedBy: string | null
): Promise<WorkspaceSubscription> {
  const ref = subscriptionRef(workspaceId);
  const existing = await ref.get();
  const now = new Date().toISOString();

  const base: WorkspaceSubscription = existing.exists
    ? (existing.data() as WorkspaceSubscription)
    : {
        workspaceId,
        planId: DEFAULT_PLAN,
        status: "active",
        billingProvider: "manual",
        customerId: null,
        subscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialStart: null,
        trialEnd: null,
        customEntitlements: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
      };

  const next: WorkspaceSubscription = { ...base, ...patch, workspaceId, updatedBy, updatedAt: now };
  await ref.set(next, { merge: false });

  const { plan, limits } = resolveEntitlements(next);
  await adminDb()
    .collection("workspaces")
    .doc(workspaceId)
    .update({
      plan,
      limits,
      subscriptionStatus: next.status,
      pendingPlan: next.status === "active" || next.status === "trialing" ? null : (next.planId ?? null),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return next;
}

/** Convenience wrapper for the common "activate this plan right now, no payment provider involved" path — manual Free/Pro/Business approval, or Enterprise activation after a sales lead closes. */
export async function activatePlanManually(
  workspaceId: string,
  planId: WorkspacePlan,
  updatedBy: string,
  customEntitlements: WorkspaceSubscription["customEntitlements"] = null
): Promise<WorkspaceSubscription> {
  return applySubscriptionUpdate(
    workspaceId,
    {
      planId,
      status: "active",
      billingProvider: "manual",
      customEntitlements,
      cancelAtPeriodEnd: false,
    },
    updatedBy
  );
}

export type { SubscriptionStatus, BillingProvider };
