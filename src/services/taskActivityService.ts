import { addDoc, deleteDoc, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { taskActivityCol } from "@/lib/firebase/firestore";
import { TaskActivityAction, TaskActor } from "@/types/task.types";

/**
 * Append-only per-task audit trail (tasks/{taskId}/activity),
 * distinct from the workspace-wide activityService used elsewhere —
 * this one powers the Task Details > Activity tab specifically.
 * Every task mutation in taskService.ts calls logTaskActivity so the
 * timeline is never assembled after the fact.
 */
export async function logTaskActivity(
  taskId: string,
  actor: TaskActor,
  action: TaskActivityAction,
  message: string,
  metadata?: Record<string, string>
): Promise<void> {
  await addDoc(taskActivityCol(taskId), {
    actor,
    action,
    message,
    metadata: metadata ?? {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getTaskActivity(taskId: string, take = 50) {
  const q = query(taskActivityCol(taskId), orderBy("createdAt", "desc"), limit(take));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Used when a task itself is deleted — Firestore never cascade-deletes a subcollection just because its parent doc is gone. */
export async function deleteAllTaskActivity(taskId: string): Promise<void> {
  const snapshot = await getDocs(taskActivityCol(taskId));
  await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
}
