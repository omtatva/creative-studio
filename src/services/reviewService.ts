import { doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { reviewsCol, reviewDoc } from "@/lib/firebase/firestore";
import { setFileReviewStatus } from "@/services/fileService";
import { logActivity } from "@/services/activityService";
import { pushNotification } from "@/services/notificationService";
import { Review } from "@/types/review.types";
import { TaskActor } from "@/types/task.types";

/**
 * Review requests bundle one or more Files (see file.types.ts) for
 * approval — the "Reviews" module. Approving a review flips every
 * referenced file's `reviewStatus` to "approved" via fileService,
 * which is what makes them show up on /downloads
 * ("Connect Reviews with Downloads"). Every state change logs to the
 * shared workspace activity feed and notifies the requester.
 */

export async function createReview(
  workspaceId: string,
  projectId: string,
  title: string,
  fileIds: string[],
  requestedBy: TaskActor
): Promise<string> {
  const docRef = doc(reviewsCol());
  const review: Omit<Review, "createdAt" | "updatedAt"> = {
    id: docRef.id,
    workspaceId,
    projectId,
    title,
    fileIds,
    status: "pending",
    requestedBy,
    reviewedBy: null,
    reviewNote: null,
  };

  await setDoc(docRef, { ...review, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  await Promise.all(fileIds.map((fileId) => setFileReviewStatus(workspaceId, fileId, "pending_review")));

  await logActivity(workspaceId, {
    actorId: requestedBy.uid,
    actorName: requestedBy.displayName,
    action: `requested review "${title}"`,
    targetType: "review",
    targetId: docRef.id,
  });

  return docRef.id;
}

export async function getWorkspaceReviews(workspaceId: string): Promise<Review[]> {
  const q = query(reviewsCol(), where("workspaceId", "==", workspaceId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getProjectReviews(workspaceId: string, projectId: string): Promise<Review[]> {
  const q = query(reviewsCol(), where("workspaceId", "==", workspaceId), where("projectId", "==", projectId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

async function getReview(workspaceId: string, reviewId: string): Promise<Review | null> {
  const snapshot = await getDoc(reviewDoc(reviewId));
  if (!snapshot.exists()) return null;
  const review = snapshot.data();
  return review.workspaceId === workspaceId ? review : null;
}

export async function decideReview(
  workspaceId: string,
  reviewId: string,
  decision: "approved" | "changes_requested",
  note: string | null,
  reviewedBy: TaskActor
): Promise<void> {
  const existing = await getReview(workspaceId, reviewId);
  if (!existing) throw new Error("Review not found in this workspace.");

  await updateDoc(reviewDoc(reviewId), {
    status: decision,
    reviewedBy,
    reviewNote: note,
    updatedAt: serverTimestamp(),
  });

  await Promise.all(
    existing.fileIds.map((fileId) =>
      setFileReviewStatus(workspaceId, fileId, decision === "approved" ? "approved" : "changes_requested")
    )
  );

  await logActivity(workspaceId, {
    actorId: reviewedBy.uid,
    actorName: reviewedBy.displayName,
    action: `${decision === "approved" ? "approved" : "requested changes on"} "${existing.title}"`,
    targetType: "review",
    targetId: reviewId,
  });

  await pushNotification(workspaceId, existing.requestedBy.uid, {
    title: decision === "approved" ? "Review approved" : "Changes requested",
    body: `"${existing.title}" was ${decision === "approved" ? "approved" : "sent back for changes"} by ${reviewedBy.displayName}.`,
    read: false,
  });
}
