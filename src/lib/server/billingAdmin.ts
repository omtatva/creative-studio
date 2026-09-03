import "server-only";
import { FieldValue, Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { resolveEntitlements } from "@/lib/entitlements";
import { mergePlanConfig } from "@/lib/planConfig";
import { DEFAULT_PLAN } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";
import type { WorkspaceSubscription, SubscriptionStatus, BillingProvider } from "@/types/billing.types";
import type { PlatformPlanConfig } from "@/types/platformConfig.types";

function subscriptionRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription");
}

function webhookEventRef(eventId: string) {
  return adminDb().collection("billing_webhook_events").doc(eventId);
}

export async function getSubscriptionAdmin(workspaceId: string): Promise<WorkspaceSubscription | null> {
  const snap = await subscriptionRef(workspaceId).get();
  return snap.exists ? (snap.data() as WorkspaceSubscription) : null;
}

/**
 * Server-only (admin SDK) writes to workspaces/{id}/billing/subscription
 * — the ONLY code allowed to touch that document at all (see its
 * firestore.rules block: client write is unconditionally denied). Every
 * caller here is itself an API route that has already independently
 * verified who's asking (verifyRequestAuth + a real role/Super-Admin
 * check, or the webhook's signature/shared-secret check) — this module
 * does the actual write, not the authorization decision.
 *
 * Runs as ONE Firestore transaction (subscription read+write, live
 * plan-config read, and the workspace cache update, together) so two
 * concurrent calls for the SAME workspace (e.g. a duplicate webhook
 * delivery, or a user double-clicking "Change Plan") can never produce
 * a lost update — Firestore automatically retries the loser against
 * the winner's already-committed state, producing one deterministic
 * final subscription rather than a race. This is what "ONE
 * authoritative subscription state" (Section 24) actually means in
 * Firestore terms: not a `runTransaction` per caller reinventing this,
 * but every caller going through this single function.
 */
export async function applySubscriptionUpdate(
  workspaceId: string,
  patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">>,
  updatedBy: string | null
): Promise<WorkspaceSubscription> {
  return adminDb().runTransaction((tx) => applySubscriptionUpdateInTransaction(tx, workspaceId, patch, updatedBy));
}

async function applySubscriptionUpdateInTransaction(
  tx: Transaction,
  workspaceId: string,
  patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">>,
  updatedBy: string | null
): Promise<WorkspaceSubscription> {
  const ref = subscriptionRef(workspaceId);
  const workspaceRef = adminDb().collection("workspaces").doc(workspaceId);
  const planConfigRef = adminDb().collection("platform_config").doc("plans");

  // All reads before any writes — required for Firestore transactions,
  // and incidentally what makes this atomic in the first place.
  const [existingSnap, planConfigSnap] = await Promise.all([tx.get(ref), tx.get(planConfigRef)]);
  const now = new Date().toISOString();

  const base: WorkspaceSubscription = existingSnap.exists
    ? (existingSnap.data() as WorkspaceSubscription)
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
  tx.set(ref, next, { merge: false });

  const planLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits;
  const { plan, limits } = resolveEntitlements(next, planLimits);

  tx.update(workspaceRef, {
    plan,
    limits,
    subscriptionStatus: next.status,
    pendingPlan: next.status === "active" || next.status === "trialing" ? null : (next.planId ?? null),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return next;
}

/**
 * Webhook-specific: applies a subscription patch AND records the
 * provider's own event id as an idempotency key, atomically in the
 * SAME transaction — a duplicate delivery of the identical event
 * (payment providers routinely retry, and can deliver more than once
 * for the same event) sees the idempotency doc already exists and
 * returns the ALREADY-APPLIED result without reapplying anything,
 * rather than a second call racing the first one. This is
 * Section 24's "no duplicate subscription/invoice/entitlement created"
 * requirement in concrete terms.
 *
 * The idempotency doc's `applied` payload lets a genuine duplicate
 * return the same response the original call did, rather than an
 * empty/ambiguous "already processed" with no data.
 */
export async function applySubscriptionUpdateIdempotent(
  eventId: string,
  workspaceId: string,
  patch: Partial<Omit<WorkspaceSubscription, "workspaceId" | "createdAt">>
): Promise<{ subscription: WorkspaceSubscription; duplicate: boolean }> {
  const eventRef = webhookEventRef(eventId);

  return adminDb().runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) {
      const applied = eventSnap.data()?.appliedSubscription as WorkspaceSubscription | undefined;
      if (applied) return { subscription: applied, duplicate: true };
      // Idempotency doc exists but somehow has no payload (shouldn't
      // happen) — fail closed rather than silently reapplying.
      throw new Error(`Webhook event ${eventId} was already recorded but has no stored result.`);
    }

    const subscription = await applySubscriptionUpdateInTransaction(tx, workspaceId, patch, null);

    tx.set(eventRef, {
      eventId,
      workspaceId,
      processedAt: FieldValue.serverTimestamp(),
      appliedSubscription: subscription,
    });

    return { subscription, duplicate: false };
  });
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
