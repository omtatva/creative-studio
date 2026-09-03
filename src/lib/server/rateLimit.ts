import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";

/**
 * Distributed, fixed-window rate limiter (Section 30) — the counter
 * lives in Firestore, not process memory, so it's correct across
 * however many App Hosting/Cloud Run instances happen to be running;
 * an in-memory Map would let each instance enforce its own separate
 * limit, which isn't a real limit at all under horizontal scaling.
 *
 * `key` should uniquely identify what's being limited — e.g.
 * `ai-generate:{uid}`, `sales-lead:{ip}`, `invite-send:{uid}`. Throws
 * RateLimitExceededError (never silently allows) once `limit` is hit
 * within the current `windowSeconds` window.
 *
 * Operational note: this creates one small doc per key per window
 * (rate_limits/{key}_{windowId}) — old windows aren't deleted by this
 * code. Configure a Firestore TTL policy on this collection's
 * `updatedAt` field (Firebase Console > Firestore > TTL, or `gcloud
 * firestore fields ttls update`) to auto-expire them; not done here
 * since it's a one-time infrastructure setting, not application code.
 */
export class RateLimitExceededError extends Error {}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const windowId = Math.floor(Date.now() / 1000 / windowSeconds);
  const ref = adminDb().collection("rate_limits").doc(`${key}_${windowId}`);

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? ((snap.data()?.count as number | undefined) ?? 0) : 0;

    if (count >= limit) {
      throw new RateLimitExceededError("Too many requests. Please try again shortly.");
    }

    tx.set(ref, { key, windowId, count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Best-effort real client IP from standard proxy headers (Cloud Run/App Hosting sets x-forwarded-for) — for rate-limiting PUBLIC, unauthenticated endpoints where there's no uid to key on. Never used for authorization, only abuse-mitigation. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
