import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { WorkspaceQuotaError, ensureCounterInitialized } from "@/lib/server/workspaceQuota";
import { mergePlanConfig } from "@/lib/planConfig";
import { resolveEntitlements } from "@/lib/entitlements";
import { logPlatformAudit } from "@/lib/server/platformAudit";
import type { PlatformPlanConfig } from "@/types/platformConfig.types";
import type { WorkspaceSubscription } from "@/types/billing.types";

export const runtime = "nodejs";

/**
 * Restoring an archived project INCREASES the active count, so it's
 * the same threat class as creation — it must be checked against
 * maxProjects, not just allowed unconditionally the way it was
 * before. firestore.rules' `projects` update rule now specifically
 * denies a client-direct true->false `isArchived` transition, forcing
 * it through here, where the limit check and the actual flip happen
 * in ONE transaction (not reserveSlot() followed by a separate
 * update() — that would leave a window where a slot is reserved but
 * the project was never actually un-archived if the second write
 * failed).
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed.", code: "WORKSPACE_ACCESS_DENIED" }, { status });
  }

  let body: { workspaceId?: string; projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { workspaceId, projectId } = body;
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId and projectId are required." }, { status: 400 });
  }

  const [memberSnap, projectMemberSnap] = await Promise.all([
    adminDb().collection("members").doc(`${workspaceId}_${uid}`).get(),
    adminDb().collection("project_members").doc(`${projectId}_${uid}`).get(),
  ]);
  const workspaceRole = memberSnap.exists ? (memberSnap.data()?.role as string | undefined) : undefined;
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";
  const projectRole = projectMemberSnap.exists ? (projectMemberSnap.data()?.role as string | undefined) : undefined;
  const isProjectManager = projectRole === "owner" || projectRole === "manager";
  if (!isWorkspaceAdmin && !isProjectManager) {
    return NextResponse.json({ error: "You don't have permission to restore this project.", code: "INSUFFICIENT_ROLE" }, { status: 403 });
  }

  const [subSnap, planConfigSnap] = await Promise.all([
    adminDb().collection("workspaces").doc(workspaceId).collection("billing").doc("subscription").get(),
    adminDb().collection("platform_config").doc("plans").get(),
  ]);
  const subscription = subSnap.exists ? (subSnap.data() as WorkspaceSubscription) : null;
  const planLimits = mergePlanConfig(planConfigSnap.exists ? (planConfigSnap.data() as PlatformPlanConfig) : null).limits;
  const limit = resolveEntitlements(subscription, planLimits).limits.maxProjects;

  const workspaceRef = adminDb().collection("workspaces").doc(workspaceId);
  const projectRef = adminDb().collection("projects").doc(projectId);

  if (Number.isFinite(limit)) {
    await ensureCounterInitialized(workspaceId, "project");
  }

  try {
    await adminDb().runTransaction(async (tx) => {
      const [workspaceSnap, projectSnap] = await Promise.all([tx.get(workspaceRef), tx.get(projectRef)]);
      if (!workspaceSnap.exists) throw new Error("Workspace not found.");
      if (!projectSnap.exists || projectSnap.data()?.workspaceId !== workspaceId) {
        throw new Error("Project not found in this workspace.");
      }
      if (projectSnap.data()?.isArchived !== true) {
        // Already active — nothing to restore, and definitely nothing
        // to count twice.
        return;
      }

      if (Number.isFinite(limit)) {
        const current = (workspaceSnap.data()?.projectCount as number | undefined) ?? 0;
        if (current >= limit) {
          throw new WorkspaceQuotaError("PROJECT_LIMIT_REACHED", `This workspace has reached its plan's limit of ${limit} active projects.`);
        }
        tx.update(workspaceRef, { projectCount: current + 1, updatedAt: FieldValue.serverTimestamp() });
      }

      tx.update(projectRef, { isArchived: false, archivedAt: null, updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    if (err instanceof WorkspaceQuotaError) {
      await logPlatformAudit({ actorUid: uid, action: "subscription_status_changed", workspaceId, details: { event: "project_restore_blocked_quota", projectId } });
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Couldn't restore this project.";
    console.error("[projects/restore] failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
