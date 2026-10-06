import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { resyncWorkspaceBillingCache } from "@/lib/server/billingAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

/**
 * Lazy, server-side repair of a workspace's billing DISPLAY cache
 * (`plan`/`limits`/`subscriptionStatus`/`pendingPlan`/`trialEnd` on
 * `workspaces/{id}` — client-write-locked in firestore.rules) from its
 * authoritative subscription doc. Exists because nothing writes on a
 * timer when a trial ends, so the cache would otherwise keep saying
 * "Pro Trial" until some unrelated subscription write happened — see
 * resyncWorkspaceBillingCache in billingAdmin.ts.
 *
 * Callable by any member of the workspace (or Super Admin, for the
 * cross-workspace admin surfaces): it takes no billing input from the
 * caller at all — every value written is derived from server-held
 * data — so triggering it can't change what anyone is entitled to,
 * only make the cache match what resolveEntitlements already enforces.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  try {
    await enforceRateLimit(`billing-resync:${uid}`, 60, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: { workspaceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { workspaceId } = body;
  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json({ error: "A valid workspaceId is required." }, { status: 400 });
  }

  const memberSnap = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  if (!memberSnap.exists) {
    try {
      await verifySuperAdminAuth(request);
    } catch {
      return NextResponse.json({ error: "Not a member of this workspace." }, { status: 403 });
    }
  }

  try {
    const { cache, changed } = await resyncWorkspaceBillingCache(workspaceId);
    // `limits` is deliberately not returned: it can contain Infinity
    // (Enterprise), which JSON turns into null. Callers re-read the
    // workspace doc when `changed` is true instead.
    return NextResponse.json({ success: true, changed, cache: { plan: cache.plan, subscriptionStatus: cache.subscriptionStatus } });
  } catch (err) {
    console.error("[billing/resync-cache] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't resync billing state." }, { status: 500 });
  }
}
