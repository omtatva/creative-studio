import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { applySubscriptionUpdate } from "@/lib/server/billingAdmin";

export const runtime = "nodejs";

const TRIAL_DAYS = 7;
const TRIAL_PLAN = "pro" as const;

/**
 * Starts every brand-new workspace's 7-day Pro trial — called once,
 * right after createWorkspace() succeeds (see useWorkspace.ts). Owner-
 * only (re-verified here via the just-created `members` doc, never
 * trusted from the client) so this can't be replayed to re-extend an
 * existing workspace's trial. `resolveEntitlements` (entitlements.ts)
 * is what actually stops enforcing Pro limits once `trialEnd` passes —
 * this route only ever WRITES the trial window, it doesn't need a
 * cron job to end it (see that function's doc comment).
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: { workspaceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId } = body;
  if (!workspaceId) {
    return NextResponse.json({ error: "A valid workspaceId is required." }, { status: 400 });
  }

  const memberSnap = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  const role = memberSnap.exists ? (memberSnap.data()?.role as string | undefined) : undefined;
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the workspace's own owner can start its trial." }, { status: 403 });
  }

  const existing = await adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription").get();
  if (existing.exists) {
    // Already has a subscription record (trial already started, or
    // already a real paying customer) — never overwrite it.
    return NextResponse.json({ success: true, subscription: existing.data() });
  }

  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const subscription = await applySubscriptionUpdate(
    workspaceId,
    {
      planId: TRIAL_PLAN,
      status: "trialing",
      billingProvider: "manual",
      trialStart: now.toISOString(),
      trialEnd: trialEnd.toISOString(),
      cancelAtPeriodEnd: false,
    },
    uid
  );

  return NextResponse.json({ success: true, subscription });
}
