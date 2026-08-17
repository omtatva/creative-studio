import { arrayRemove, arrayUnion, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { stagesCol, stageDoc } from "@/lib/firebase/firestore";
import { logActivity } from "@/services/activityService";
import { CreateStagePayload, Stage } from "@/types/stage.types";
import { TaskActor } from "@/types/task.types";

/**
 * Creative Stages — see types/stage.types.ts for why this is a
 * top-level collection rather than a nested subcollection. Same
 * enforcement pattern as projectService/taskService: every function
 * takes `workspaceId` and re-validates a fetched doc against it.
 */

export async function createStage(
  workspaceId: string,
  projectId: string,
  payload: CreateStagePayload,
  createdBy: TaskActor
): Promise<string> {
  const stageRef = doc(stagesCol());
  const stage: Omit<Stage, "createdAt" | "updatedAt"> = {
    id: stageRef.id,
    workspaceId,
    projectId,
    name: payload.name,
    description: payload.description,
    templateKey: payload.templateKey,
    fileIds: [],
    createdBy,
    isArchived: false,
  };

  await setDoc(stageRef, { ...stage, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  await logActivity(workspaceId, {
    actorId: createdBy.uid,
    actorName: createdBy.displayName,
    action: `created stage "${payload.name}"`,
    targetType: "stage",
    targetId: stageRef.id,
  });

  return stageRef.id;
}

export async function getProjectStages(workspaceId: string, projectId: string): Promise<Stage[]> {
  const q = query(stagesCol(), where("workspaceId", "==", workspaceId), where("projectId", "==", projectId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

const DEFAULT_STAGE_NAME = "General";

/**
 * Returns an existing (non-archived) stage to use as the upload
 * target, or creates one named "General" if the project truly has
 * none yet. This is what guarantees every asset can always be given a
 * real stageId — never creates a second default if any stage already
 * exists (named "General" or not), so it's safe to call on every
 * project-create and every upload that doesn't specify a stage.
 */
export async function getOrCreateDefaultStage(workspaceId: string, projectId: string, actor: TaskActor): Promise<string> {
  const existing = await getProjectStages(workspaceId, projectId);
  const active = existing.filter((s) => !s.isArchived);
  if (active.length > 0) return active[0]!.id;

  return createStage(
    workspaceId,
    projectId,
    { name: DEFAULT_STAGE_NAME, description: "Default stage for uploads.", templateKey: null },
    actor
  );
}

async function getStage(workspaceId: string, stageId: string): Promise<Stage | null> {
  const snapshot = await getDoc(stageDoc(stageId));
  if (!snapshot.exists()) return null;
  const stage = snapshot.data();
  return stage.workspaceId === workspaceId ? stage : null;
}

export async function addFileToStage(stageId: string, fileId: string): Promise<void> {
  await updateDoc(stageDoc(stageId), { fileIds: arrayUnion(fileId), updatedAt: serverTimestamp() });
}

export async function removeFileFromStage(stageId: string, fileId: string): Promise<void> {
  await updateDoc(stageDoc(stageId), { fileIds: arrayRemove(fileId), updatedAt: serverTimestamp() });
}

export async function renameStage(workspaceId: string, stageId: string, name: string, actor: TaskActor): Promise<void> {
  const existing = await getStage(workspaceId, stageId);
  if (!existing) throw new Error("Stage not found in this workspace.");
  await updateDoc(stageDoc(stageId), { name, updatedAt: serverTimestamp() });
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `renamed stage "${existing.name}" to "${name}"`,
    targetType: "stage",
    targetId: stageId,
  });
}

export async function archiveStage(workspaceId: string, stageId: string, actor: TaskActor): Promise<void> {
  const existing = await getStage(workspaceId, stageId);
  if (!existing) throw new Error("Stage not found in this workspace.");
  await updateDoc(stageDoc(stageId), { isArchived: true, updatedAt: serverTimestamp() });
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `archived stage "${existing.name}"`,
    targetType: "stage",
    targetId: stageId,
  });
}
