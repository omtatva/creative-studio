import { deleteDoc, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { taskCommentsCol, taskCommentDoc, taskDoc } from "@/lib/firebase/firestore";
import { logTaskActivity } from "@/services/taskActivityService";
import { TaskActor, TaskComment } from "@/types/task.types";

/**
 * Comment CRUD for a single task's `comments` subcollection.
 * Mentions are parsed by the caller (RichTextEditor / TaskCommentsTab)
 * before this is called — this layer just persists the resulting
 * `mentionedUids` alongside the rich HTML body.
 */

interface AddCommentArgs {
  taskId: string;
  author: TaskActor;
  bodyHtml: string;
  mentionedUids: string[];
  parentCommentId: string | null;
}

export async function addComment({ taskId, author, bodyHtml, mentionedUids, parentCommentId }: AddCommentArgs): Promise<string> {
  const commentRef = doc(taskCommentsCol(taskId));

  const comment: Omit<TaskComment, "createdAt" | "updatedAt"> = {
    id: commentRef.id,
    authorId: author.uid,
    author,
    bodyHtml,
    mentionedUids,
    parentCommentId,
    isEdited: false,
  };

  await setDoc(commentRef, { ...comment, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await updateDoc(taskDoc(taskId), { commentCount: increment(1) });

  await logTaskActivity(
    taskId,
    author,
    "comment_added",
    parentCommentId ? "replied to a comment" : "added a comment",
    mentionedUids.length ? { mentions: String(mentionedUids.length) } : undefined
  );

  return commentRef.id;
}

export async function editComment(taskId: string, commentId: string, bodyHtml: string, actor: TaskActor): Promise<void> {
  const snapshot = await getDoc(taskCommentDoc(taskId, commentId));
  if (!snapshot.exists()) throw new Error("Comment not found.");

  await updateDoc(taskCommentDoc(taskId, commentId), { bodyHtml, isEdited: true, updatedAt: serverTimestamp() });
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
