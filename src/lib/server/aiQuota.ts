import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";

/**
 * Server-side, atomic AI-generation quota enforcement — Section 29's
 * "AI COST PROTECTION" and Section 38's "atomic usage accounting...
 * to prevent concurrent requests from bypassing quotas."
 *
 * Deliberately a SEPARATE, minimal counter doc
 * (ai_usage_counters/{workspaceId}_{yyyy-MM}), not the existing
 * ai_usage_logs collection aiService.ts already writes one doc per
 * generation to (that collection backs the human-readable "AI
 * Activity" feed — prompts, results, per-generation records — and
 * checking a limit against it today means scanning every log doc for
 * the workspace, an unbounded read that only gets more expensive as
 * usage grows). This counter is purpose-built for the ONE thing that
 * actually needs to be atomic and cheap: "has this workspace hit its
 * monthly limit," checked and incremented in the SAME Firestore
 * transaction so two concurrent requests can never both read
 * "one under the limit" and both proceed.
 */
export class AIQuotaExceededError extends Error {}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function counterRef(workspaceId: string) {
  return adminDb().collection("ai_usage_counters").doc(`${workspaceId}_${currentMonthKey()}`);
}

/**
 * Throws AIQuotaExceededError (never silently allows) if incrementing
 * would exceed `limit`. `limit` non-finite (Infinity, the Enterprise
 * default) skips the check entirely — nothing to enforce.
 */
export async function checkAndIncrementAIUsage(workspaceId: string, limit: number): Promise<void> {
  if (!Number.isFinite(limit)) return;
  const ref = counterRef(workspaceId);

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? ((snap.data()?.count as number | undefined) ?? 0) : 0;

    if (used >= limit) {
      throw new AIQuotaExceededError(
        `This workspace has reached its plan's monthly AI generation limit (${limit}). Contact your workspace owner about upgrading.`
      );
    }

    tx.set(
      ref,
      { workspaceId, month: currentMonthKey(), count: used + 1, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
}
