import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { expireAt, PREVIEW_TICKET_TTL_MS } from "@/lib/server/ttl";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * INTERNAL VERSION COMPARE — validates a pair of versions and hands back
 * short-lived PREVIEW tickets (not download tickets, not the permanent Firebase
 * token URL). The request is authorized from real records, never from the client:
 *   authenticated  +  project access (workspace membership alone is not enough)
 *   +  BOTH files exist in this workspace, in the SAME project,
 *   +  the SAME asset (assetGroupId — legacy files without one group by their own
 *      id, so two different legacy files can never be paired)
 *   +  neither is archived.
 * Playback of the returned tickets is served by GET /api/files/preview, which
 * re-checks project access on every request. Previewing is a separate permission
 * from downloading: nothing here consults or grants `files.download`.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Authentication failed.", err instanceof AuthVerificationError ? err.status : 401);
  }
  try {
    await enforceRateLimit(`file-compare:${uid}`, 60, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return bad(err.message, 429);
    throw err;
  }

  let body: { workspaceId?: unknown; fileIdA?: unknown; fileIdB?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body.");
  }
  const { workspaceId, fileIdA, fileIdB } = body;
  if (typeof workspaceId !== "string" || typeof fileIdA !== "string" || typeof fileIdB !== "string" || !workspaceId || !fileIdA || !fileIdB) return bad("workspaceId, fileIdA and fileIdB are required.");
  if (fileIdA === fileIdB) return bad("Pick two different versions to compare.");

  const [snapA, snapB] = await Promise.all([adminDb().collection("files").doc(fileIdA).get(), adminDb().collection("files").doc(fileIdB).get()]);
  const a = snapA.data();
  const b = snapB.data();
  const generic = () => bad("Those versions can't be compared.", 404);
  if (!snapA.exists || !snapB.exists || !a || !b) return generic();
  if (a.workspaceId !== workspaceId || b.workspaceId !== workspaceId || a.projectId !== b.projectId) return generic();
  if ((a.assetGroupId || snapA.id) !== (b.assetGroupId || snapB.id)) return generic();
  if (a.reviewStatus === "archived" || b.reviewStatus === "archived") return generic();

  const access = await resolveProjectAccess(uid, workspaceId, a.projectId);
  if (!access.canRead) return bad("You don't have access to this project's files.", 403);

  type FileFields = { projectId: string; storagePath: string; contentType: string; versionNumber?: number; assetType: string; fileName: string; durationSeconds?: number | null };
  const issue = async (id: string, f: FileFields) => {
    const ticket = randomBytes(24).toString("hex");
    await adminDb().collection("preview_tickets").doc(ticket).set({
      uid, workspaceId, projectId: f.projectId, fileId: id, storagePath: f.storagePath, contentType: f.contentType,
      expiresAtMs: Date.now() + PREVIEW_TICKET_TTL_MS, expireAt: expireAt(Date.now() + PREVIEW_TICKET_TTL_MS),
    });
    return {
      ticket, fileId: id, versionNumber: f.versionNumber ?? 1, assetType: f.assetType, contentType: f.contentType,
      fileName: f.fileName, durationSeconds: f.durationSeconds ?? null,
    };
  };
  const [sideA, sideB] = await Promise.all([issue(snapA.id, a as FileFields), issue(snapB.id, b as FileFields)]);
  return NextResponse.json({ a: sideA, b: sideB });
}
