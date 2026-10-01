import { deleteDoc, getDocs, increment, updateDoc } from "firebase/firestore";
import { getCurrentUser } from "@/lib/firebase/auth";
import { taskCommentsCol, taskCommentDoc, taskDoc } from "@/lib/firebase/firestore";
import { logTaskActivity } from "@/services/taskActivityService";
import { TaskActor } from "@/types/task.types";

/**
 * Comment CRUD for a single task's `comments` subcollection.
 * Mentions are parsed by the caller (RichTextEditor / TaskCommentsTab)
 * before this is called — this layer just persists the resulting
 * `mentionedUids` alongside the rich HTML body.
 *
 * SECURITY (audit Priority 2): create/edit go through server API
 * routes now, not a direct Firestore write — bodyHtml is rich text
 * rendered via dangerouslySetInnerHTML elsewhere, and only the server
 * can be trusted to sanitize it before persistence (see
 * lib/utils/htmlSanitizer.ts and firestore.rules' comments create/
 * update rules, now `if false`). Delete is unaffected — it carries no
 * HTML and stays a direct client write.
 */

async function callTaskApi<T>(path: string, body: unknown): Promise<T> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed.");
  }
  return data as T;
}

interface AddCommentArgs {
  taskId: string;
  author: TaskActor;
  bodyHtml: string;
  mentionedUids: string[];
  parentCommentId: string | null;
}

export async function addComment({ taskId, author, bodyHtml, mentionedUids, parentCommentId }: AddCommentArgs): Promise<string> {
  const { commentId } = await callTaskApi<{ commentId: string }>("/api/tasks/comments/create", {
    taskId,
    bodyHtml,
    mentionedUids,
    parentCommentId,
    displayName: author.displayName,
    photoURL: author.photoURL,
    email: author.email,
  });

  await logTaskActivity(
    taskId,
    author,
    "comment_added",
    parentCommentId ? "replied to a comment" : "added a comment",
    mentionedUids.length ? { mentions: String(mentionedUids.length) } : undefined
  );

  return commentId;
}

export async function editComment(taskId: string, commentId: string, bodyHtml: string, actor: TaskActor): Promise<void> {
  await callTaskApi("/api/tasks/comments/update", { taskId, commentId, bodyHtml });
  await logTaskActivity(taskId, actor, "comment_edited", "edited a comment");
}

export async function deleteComment(taskId: string, commentId: string, actor: TaskActor): Promise<void> {
  await deleteDoc(taskCommentDoc(taskId, commentId));
  await updateDoc(taskDoc(taskId), { commentCount: increment(-1) });
  await logTaskActivity(taskId, actor, "comment_deleted", "deleted a comment");
}

/** Used when a task itself is deleted — Firestore never cascade-deletes a subcollection just because its parent doc is gone. */
export async function deleteAllComments(taskId: string): Promise<void> {
  const snapshot = await getDocs(taskCommentsCol(taskId));
  await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
}
