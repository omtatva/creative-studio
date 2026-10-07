import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "crypto";
import { adminDb } from "@/lib/server/firebaseAdmin";

export interface NotificationInput {
  title: string;
  body: string;
  /** A same-origin path (never a URL). The destination page still enforces its own authorization. */
  link: string;
  type: string;
  projectId?: string;
}

/**
 * The ONLY writer of `workspaces/{ws}/notifications/{uid}/items/*` —
 * firestore.rules makes that collection client-create-denied, so a
 * client can never choose a recipient or text. The document id is a hash
 * of `eventKey` (event type + target + recipient + a version of the
 * event), and the write is a `create()`, so a retry, a double click or a
 * replayed request for the SAME event hits ALREADY_EXISTS and is
 * reported as a duplicate instead of producing a second notification.
 */
export async function createNotificationOnce(workspaceId: string, recipientUid: string, eventKey: string, input: NotificationInput): Promise<{ created: boolean }> {
  const id = createHash("sha256").update(eventKey).digest("hex").slice(0, 32);
  const ref = adminDb().collection("workspaces").doc(workspaceId).collection("notifications").doc(recipientUid).collection("items").doc(id);
  try {
    await ref.create({ ...input, read: false, createdAt: FieldValue.serverTimestamp() });
    return { created: true };
  } catch (err) {
    // gRPC ALREADY_EXISTS (6) — the event was already delivered.
    if ((err as { code?: number | string })?.code === 6 || (err as { code?: number | string })?.code === "already-exists") return { created: false };
    throw err;
  }
}
