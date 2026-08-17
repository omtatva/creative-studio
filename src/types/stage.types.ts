import { ID, Timestamps } from "./common.types";
import { TaskActor } from "./task.types";

/**
 * A Creative Stage groups a set of project assets (files) together
 * for a piece of work-in-progress — e.g. "Homepage Hero Video" or
 * "Q3 Social Campaign". Follows the same top-level-collection-with-
 * workspaceId+projectId pattern as files/reviews/tasks (see
 * lib/firebase/firestore.ts) rather than a subcollection nested under
 * a `projects/{id}` doc, since projects here are already a flat
 * collection with no such container to nest under — this keeps
 * stages queryable/rule-checked exactly like every sibling collection.
 * Membership (`fileIds`) references `files` docs directly, mirroring
 * how `Review.fileIds` references them.
 */
export interface Stage extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID;
  name: string;
  description: string;
  templateKey: string | null; // which StageTemplate this was created from, if any
  fileIds: ID[];
  createdBy: TaskActor;
  isArchived: boolean;
}

export interface CreateStagePayload {
  name: string;
  description: string;
  templateKey: string | null;
}
