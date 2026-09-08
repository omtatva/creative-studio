import "server-only";
import { FieldValue, Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { mergePlanConfig } from "@/lib/planConfig";
import type { PlatformPlanConfig } from "@/types/platformConfig.types";
import type { WorkspaceSubscription } from "@/types/billing.types";
import { resolveEntitlements } from "@/lib/entitlements";

/**
 * Server-side, transaction-atomic maxMembers/maxProjects enforcement —
 * the disclosed gap from the earlier billing security audit
 * (planService.ts's checkWorkspaceLimit is a CLIENT-SIDE pre-check
 * only; Firestore rules have no aggregate-count primitive, so nothing
 * server-side previously stopped a client from exceeding either
 * limit by calling the Firestore SDK directly, or by racing two
 * concurrent requests).
 *
 * ARCHITECTURE — what's authoritative and why:
 *   - `workspaces/{id}.projectCount` / `.memberCount` are the
 *     AUTHORITATIVE counters for quota enforcement — maintained here,
 *     admin-SDK-write-only (see firestore.rules' workspaces/{id}
 *     update rule, which explicitly excludes these two fields from
 *     client writes — otherwise any owner/admin could just set them
 *     to 0 directly and defeat this entire mechanism).
 *   - The INCREMENT direction (reserveSlot — a project/member being
 *     ADDED) is STRICTLY atomic: a Firestore transaction reads the
 *     counter and the workspace's live effective limit, and only
 *     commits the increment if it's still under the limit. Two
 *     concurrent reservations for the last available slot cannot both
 *     succeed — Firestore retries the loser against the winner's
 *     already-committed counter value.
 *   - The DECREMENT direction (resyncSlotCount — freeing a slot after
 *     an archive/delete/member-removal) is deliberately NOT a blind
 *     "decrement by 1" call. A client that could call an unconditional
 *     decrement repeatedly, without actually removing anything, would
 *     be able to drive the counter arbitrarily low and then create far
 *     more projects/members than the real limit allows — the exact
 *     same class of bypass this whole mechanism exists to prevent,
 *     just via the other direction. Instead, resyncSlotCount always
 *     recomputes the counter from a REAL aggregate count of the
 *     underlying collection, so calling it any number of times, by
 *     anyone, for any reason, only ever converges the counter toward
 *     the truth — there is nothing to exploit. This trades a small
 *     window of eventual consistency (a resync's aggregate read and
 *     its write are not the same atomic operation as a concurrent
 *     reservation, so on a rare race the counter could under-count by
 *     one until the next resync) for a mechanism with no abuse
 *     surface at all — acceptable because under-counting only ever
 *     lets a workspace use very slightly more capacity than its plan
 *     allows for a brief window, never a permanent or large bypass.
 *   - Existing workspaces created before these counters existed are
 *     backfilled lazily, on first use, from a real aggregate count —
 *     no migration script, no forced workspace recreation.
 */

export type QuotaMetric = "project" | "member";
export type QuotaErrorCode = "PROJECT_LIMIT_REACHED" | "MEMBER_LIMIT_REACHED";

export class WorkspaceQuotaError extends Error {
  code: QuotaErrorCode;
  constructor(code: QuotaErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const COUNTER_FIELD: Record<QuotaMetric, "projectCount" | "memberCount"> = {
  project: "projectCount",
  member: "memberCount",
};
const LIMIT_KEY: Record<QuotaMetric, "maxProjects" | "maxMembers"> = {
  project: "maxProjects",
  member: "maxMembers",
};
const ERROR_CODE: Record<QuotaMetric, QuotaErrorCode> = {
  project: "PROJECT_LIMIT_REACHED",
  member: "MEMBER_LIMIT_REACHED",
};

function workspaceRef(workspaceId: string) {
  return adminDb().collection("workspaces").doc(workspaceId);
}

/** Real, current count of the underlying collection — used only for lazy backfill and resync, never on the hot atomic-check path (that reads the maintained counter field instead, which is O(1) rather than a collection scan). */
async function countReal(metric: QuotaMetric, workspaceId: string): Promise<number> {
  if (metric === "project") {
    const snap = await adminDb()
      .collection("projects")
      .where("workspaceId", "==", workspaceId)
      .where("isArchived", "==", false)
      .count()
      .get();
    return snap.data().count;
  }
  const snap = await adminDb().collection("members").where("workspaceId", "==", workspaceId).count().get();
  return snap.data().count;
}

/**
 * Live, authoritative effective limits — resolved from the real
 * subscription doc + live plan config (mergePlanConfig/
 * resolveEntitlements, the exact same functions billingAdmin.ts uses),
 * NOT the cached workspace.limits field. This matters specifically
 * for a JUST-expired trial: the cache only re-syncs on the next real
 * subscription event, so trusting it here could let a workspace whose
 * trial ended seconds ago keep creating at the higher trial limit
 * until something else happens to trigger a resync.
 */
async function resolveLiveLimit(workspaceId: string, metric: QuotaMetric): Promise<number> {
  const [subSnap, planConfigSnap] = await Promise.all([
    adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription").get(),
    adminDb().collection("platform_config").doc("plans").get(),
  ]);
  const subscription = subSnap.exists ? (subSnap.data() as WorkspaceSubscription) : null;
  const planLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits;
  const { limits } = resolveEntitlements(subscription, planLimits);
  return limits[LIMIT_KEY[metric]];
}

/**
 * Atomically checks the workspace's current counter against its live
 * effective limit and increments it, all in one Firestore transaction
 * — the ONLY safe way to guarantee two concurrent reservations for
 * the same final slot can't both succeed (a naive read-count-then-
 * write has a race window; this doesn't, because Firestore retries a
 * transaction whose read set changed before it could commit).
 *
 * Throws WorkspaceQuotaError (never silently allows) if the limit
 * would be exceeded. A non-finite limit (Infinity — Enterprise's
 * default, or a custom override) always succeeds without needing the
 * transaction at all.
 */
export async function reserveSlot(workspaceId: string, metric: QuotaMetric): Promise<void> {
  const limit = await resolveLiveLimit(workspaceId, metric);
  if (!Number.isFinite(limit)) return;

  const field = COUNTER_FIELD[metric];
  const ref = workspaceRef(workspaceId);

  // Lazy backfill happens OUTSIDE the reservation transaction (it
  // needs an aggregate collection scan, which is fine as a one-time
  // repair but not something to redo on every single reservation) —
  // done first, so the transaction itself only ever does a fast,
  // single-document read+write.
  await ensureCounterInitialized(workspaceId, metric);

  await adminDb().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Workspace ${workspaceId} not found.`);
    const current = (snap.data()?.[field] as number | undefined) ?? 0;

    if (current >= limit) {
      throw new WorkspaceQuotaError(
        ERROR_CODE[metric],
        `This workspace has reached its plan's limit of ${limit} ${metric === "project" ? "active projects" : "members"}.`
      );
    }

    tx.update(ref, { [field]: current + 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

/** Exported for callers (like /api/projects/restore) that inline their own transaction rather than using reserveSlot directly, but still need the counter to reflect reality first on an old, never-backfilled workspace. */
export async function ensureCounterInitialized(workspaceId: string, metric: QuotaMetric): Promise<void> {
  const field = COUNTER_FIELD[metric];
  const ref = workspaceRef(workspaceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Workspace ${workspaceId} not found.`);
  if (typeof snap.data()?.[field] === "number") return;

  const real = await countReal(metric, workspaceId);
  await ref.update({ [field]: real, updatedAt: FieldValue.serverTimestamp() });
}

/**
 * Recomputes the counter from a REAL aggregate count and overwrites
 * it — see this file's doc comment for why this is deliberately an
 * absolute resync, never a relative "decrement by 1." Call after any
 * archive, restore-rejection cleanup, delete, or member removal.
 * Best-effort and safe to call any number of times, including
 * concurrently with itself or with a reservation — see the doc
 * comment's note on the small, self-correcting eventual-consistency
 * window this trades for having no abuse surface.
 */
export async function resyncSlotCount(workspaceId: string, metric: QuotaMetric): Promise<void> {
  const real = await countReal(metric, workspaceId);
  await workspaceRef(workspaceId).update({ [COUNTER_FIELD[metric]]: real, updatedAt: FieldValue.serverTimestamp() });
}
