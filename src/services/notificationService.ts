import { getCurrentUser } from "@/lib/firebase/auth";

/** What a notification looks like once delivered — see lib/server/notifications.ts, the only writer. */
export interface NotificationPayload {
  title: string;
  body: string;
  read: boolean;
  /** Same-origin path; the destination page still enforces its own authorization. Absent on any notification delivered before deep links existed. */
  link?: string;
  type?: string;
  /** Lets the UI hide notifications for a project the user can no longer access. */
  projectId?: string;
}

/** The events the server knows how to deliver — recipient, text and link are always derived server-side (see /api/notifications/notify). */
export type NotifyEvent =
  | { type: "task_assigned"; workspaceId: string; taskId: string }
  | { type: "review_decided"; workspaceId: string; reviewId: string }
  | { type: "project_member_added"; workspaceId: string; projectId: string; uid: string };

/**
 * Asks the server to deliver the in-app notification for something that
 * just happened. BEST-EFFORT by design: the user's real action (assigning
 * a task, deciding a review, adding a member) has already succeeded, so a
 * delivery failure is logged and never thrown back at them. Clients can no
 * longer write notification documents directly (firestore.rules), which is
 * what previously made every cross-user notification fail.
 */
export async function notifyEvent(event: NotifyEvent): Promise<void> {
  try {
    const user = getCurrentUser();
    if (!user) return;
    const idToken = await user.getIdToken();
    const response = await fetch("/api/notifications/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(event),
    });
    if (!response.ok) console.error("[notificationService] delivery refused:", response.status, (await response.json().catch(() => ({})))?.error);
  } catch (err) {
    console.error("[notificationService] delivery failed (non-fatal):", err);
  }
}
