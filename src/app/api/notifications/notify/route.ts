import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { createNotificationOnce } from "@/lib/server/notifications";
import { fileReviewRoute, projectRoute, taskRoute } from "@/lib/constants/routes";

export const runtime = "nodejs";

type NotifyEvent =
  | { type: "task_assigned"; workspaceId: string; taskId: string }
  | { type: "review_decided"; workspaceId: string; reviewId: string }
  | { type: "project_member_added"; workspaceId: string; projectId: string; uid: string };

const millis = (v: unknown): number => (v && typeof (v as { toMillis?: () => number }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : 0);

/**
 * In-app notification delivery. Firestore rules make the notification
 * feed client-create-denied (a client could otherwise write arbitrary
 * text into anyone's feed), so every notification is created HERE, from
 * a typed event:
 *   - the client sends only an event type and ids — never a recipient,
 *     title, body or link;
 *   - the server loads the real task/review/membership, verifies the
 *     caller is allowed to have caused that event, derives the recipient
 *     from the data, and checks the recipient can actually access the
 *     project (no notifying people who can't open the link);
 *   - delivery is idempotent (createNotificationOnce): replaying the
 *     same event never produces a second notification.
 * A refusal here is never an error for the user's real action — callers
 * treat notification delivery as best-effort.
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
    await enforceRateLimit(`notify:${uid}`, 60, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }

  let event: NotifyEvent;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!event || typeof event !== "object" || typeof event.workspaceId !== "string" || !event.workspaceId) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }
  const { workspaceId } = event;
  const forbidden = () => NextResponse.json({ error: "Not allowed to send this notification." }, { status: 403 });
  const skipped = (reason: string) => NextResponse.json({ success: true, delivered: false, reason });

  const actorMember = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();

  if (event.type === "task_assigned") {
    if (typeof event.taskId !== "string" || !event.taskId) return NextResponse.json({ error: "taskId is required." }, { status: 400 });
    const taskSnap = await adminDb().collection("tasks").doc(event.taskId).get();
    const task = taskSnap.data();
    if (!taskSnap.exists || !task || task.workspaceId !== workspaceId) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    const actorAccess = await resolveProjectAccess(uid, workspaceId, task.projectId);
    if (!actorAccess.canWrite) return forbidden();
    const recipient = task.assignee?.uid as string | undefined;
    if (!recipient) return skipped("unassigned");
    if (recipient === uid) return skipped("self");
    const recipientAccess = await resolveProjectAccess(recipient, workspaceId, task.projectId);
    if (!recipientAccess.canRead) return skipped("recipient has no project access");
    const actorName = actorMember.data()?.displayName ?? "A teammate";
    const result = await createNotificationOnce(workspaceId, recipient, `task_assigned:${event.taskId}:${recipient}:${millis(task.updatedAt)}`, {
      title: "New task assigned",
      body: `${actorName} assigned you to "${task.title}".`,
      link: taskRoute(event.taskId),
      type: "task_assigned",
      projectId: task.projectId,
    });
    return NextResponse.json({ success: true, delivered: result.created });
  }

  if (event.type === "review_decided") {
    if (typeof event.reviewId !== "string" || !event.reviewId) return NextResponse.json({ error: "reviewId is required." }, { status: 400 });
    const reviewSnap = await adminDb().collection("reviews").doc(event.reviewId).get();
    const review = reviewSnap.data();
    if (!reviewSnap.exists || !review || review.workspaceId !== workspaceId) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    // Only the person who actually made the decision, on a review that really was decided.
    if (!["approved", "changes_requested"].includes(review.status) || review.reviewedBy?.uid !== uid) return forbidden();
    const actorAccess = await resolveProjectAccess(uid, workspaceId, review.projectId);
    if (!actorAccess.canRead) return forbidden();
    const recipient = review.requestedBy?.uid as string | undefined;
    if (!recipient || recipient === uid) return skipped("self or no requester");
    const recipientAccess = await resolveProjectAccess(recipient, workspaceId, review.projectId);
    if (!recipientAccess.canRead) return skipped("recipient has no project access");
    // Deep link: the first reviewed file's review workspace, else the project's Reviews tab.
    let link = projectRoute(review.projectId, "reviews");
    const firstFileId = (review.fileIds as string[] | undefined)?.[0];
    if (firstFileId) {
      const fileSnap = await adminDb().collection("files").doc(firstFileId).get();
      const file = fileSnap.data();
      if (fileSnap.exists && file && file.projectId === review.projectId) link = fileReviewRoute(review.projectId, file.stageId ?? "none", firstFileId);
    }
    const approved = review.status === "approved";
    const actorName = review.reviewedBy?.displayName ?? "A reviewer";
    const result = await createNotificationOnce(workspaceId, recipient, `review_decided:${event.reviewId}:${review.status}:${millis(review.updatedAt)}`, {
      title: approved ? "Review approved" : "Changes requested",
      body: `"${review.title}" was ${approved ? "approved" : "sent back for changes"} by ${actorName}.`,
      link,
      type: "review_decided",
      projectId: review.projectId,
    });
    return NextResponse.json({ success: true, delivered: result.created });
  }

  if (event.type === "project_member_added") {
    if (typeof event.projectId !== "string" || !event.projectId || typeof event.uid !== "string" || !event.uid) {
      return NextResponse.json({ error: "projectId and uid are required." }, { status: 400 });
    }
    const projectSnap = await adminDb().collection("projects").doc(event.projectId).get();
    const project = projectSnap.data();
    if (!projectSnap.exists || !project || project.workspaceId !== workspaceId) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const actorAccess = await resolveProjectAccess(uid, workspaceId, event.projectId);
    if (!actorAccess.canManage) return forbidden();
    if (event.uid === uid) return skipped("self");
    // The membership must really exist — this can't be used to notify someone who wasn't added.
    const membershipSnap = await adminDb().collection("project_members").doc(`${event.projectId}_${event.uid}`).get();
    if (!membershipSnap.exists) return skipped("not a project member");
    const addedAt = String(membershipSnap.data()?.addedAt ?? "");
    const actorName = actorMember.data()?.displayName ?? "A teammate";
    const result = await createNotificationOnce(workspaceId, event.uid, `project_member_added:${event.projectId}:${event.uid}:${addedAt}`, {
      title: "Added to a project",
      body: `${actorName} added you to "${project.name}".`,
      link: projectRoute(event.projectId),
      type: "project_member_added",
      projectId: event.projectId,
    });
    return NextResponse.json({ success: true, delivered: result.created });
  }

  return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
}
