import "server-only";
import { createHash } from "crypto";
import { adminDb } from "@/lib/server/firebaseAdmin";
import type { DownloadEvent, DownloadMethod, DownloadStatus } from "@/types/download.types";

/** Reserved feed bucket for external reviewers' downloads — not a Firebase uid, and no Firestore rule lets anyone read it from a client. */
export const EXTERNAL_BUCKET = "_external";
const DEDUPE_WINDOW_MS = 5_000;

export const historyCol = (workspaceId: string, bucket: string) => adminDb().collection("workspaces").doc(workspaceId).collection("download_history").doc(bucket).collection("items");

/**
 * Deterministic event id => recording is idempotent. A client-supplied `requestId` (one per click) makes a retried/duplicated request map to the SAME event; without one
 * (an older client), the same person asking for the same target inside a few seconds (double-click) still collapses to one event.
 */
export function downloadEventId(actorKey: string, targetKey: string, requestId: string | null | undefined, now: number): string {
  const basis = requestId && /^[A-Za-z0-9_-]{8,64}$/.test(requestId) ? `r:${requestId}` : `t:${targetKey}:${Math.floor(now / DEDUPE_WINDOW_MS)}`;
  return createHash("sha256").update(`${actorKey}|${basis}`).digest("hex").slice(0, 40);
}

/** Allowed outcome transitions: only a `started` event can be resolved, and exactly once — a completed download can never be flipped to failed (or the reverse). */
export function canTransition(from: DownloadStatus, to: DownloadStatus): boolean {
  return from === "started" && to !== "started";
}

export interface RecordInput {
  id: string;
  actorType: "member" | "external";
  uid: string | null;
  workspaceId: string;
  projectId: string;
  kind: "file" | "attachment";
  fileId?: string | null;
  taskId?: string | null;
  attachmentId?: string | null;
  assetGroupId?: string | null;
  versionNumber?: number | null;
  fileName: string;
  sizeBytes?: number | null;
  method: DownloadMethod;
}

/**
 * Records that an AUTHORIZED download was handed out (status `started`). Best-effort: history must never break a download, so errors are swallowed (and logged without
 * any identifying detail). `create()` makes a duplicate id a no-op instead of overwriting an event that has already been resolved.
 */
export async function recordDownloadStarted(input: RecordInput): Promise<void> {
  const now = Date.now();
  const event: DownloadEvent = {
    id: input.id, kind: input.kind, actorType: input.actorType, uid: input.uid, workspaceId: input.workspaceId, projectId: input.projectId,
    fileId: input.fileId ?? null, taskId: input.taskId ?? null, attachmentId: input.attachmentId ?? null, assetGroupId: input.assetGroupId ?? null,
    versionNumber: input.versionNumber ?? null, fileName: input.fileName, sizeBytes: input.sizeBytes ?? null, method: input.method,
    status: "started", reason: null, createdAt: now, updatedAt: now, completedAt: null,
  };
  try {
    await historyCol(input.workspaceId, input.actorType === "member" && input.uid ? input.uid : EXTERNAL_BUCKET).doc(input.id).create(event);
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code !== 6 && code !== "already-exists") console.error("[downloadHistory] record failed:", code ?? "unknown");
  }
}

/** Resolves a `started` event exactly once (transactional guard). Returns whether this call changed it. Never throws. */
export async function resolveDownload(workspaceId: string, bucket: string, id: string, status: Exclude<DownloadStatus, "started">, reason: string | null = null): Promise<boolean> {
  try {
    const ref = historyCol(workspaceId, bucket).doc(id);
    return await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.data() as DownloadEvent | undefined;
      if (!snap.exists || !cur || !canTransition(cur.status, status)) return false;
      const now = Date.now();
      tx.update(ref, { status, reason, updatedAt: now, completedAt: status === "completed" ? now : null });
      return true;
    });
  } catch {
    return false;
  }
}
