import { ID, Timestamps } from "./common.types";
import { TaskActor } from "./task.types";

export type ReviewStatus = "pending" | "approved" | "changes_requested";

/**
 * A review request bundles one or more ProjectFiles for approval.
 * Approving a review flips each referenced file's `reviewStatus` to
 * "approved", which is what makes it eligible to show up in
 * Downloads — see reviewService.approveReview.
 */
export interface Review extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  title: string;
  fileIds: ID[];
  status: ReviewStatus;
  requestedBy: TaskActor;
  reviewedBy: TaskActor | null;
  reviewNote: string | null;
}
