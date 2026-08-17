import { deleteDoc, doc, getDoc, getDocs, increment, setDoc, updateDoc } from "firebase/firestore";
import { taskAttachmentsCol, taskAttachmentDoc, taskDoc } from "@/lib/firebase/firestore";
import { taskAttachmentRef, uploadFile, deleteFile, fileRefFromPath } from "@/lib/firebase/storage";
import { logTaskActivity } from "@/services/taskActivityService";
import { AttachmentVersion, TaskActor, TaskAttachment } from "@/types/task.types";

/**
 * Attachment upload/list/delete for a task's `attachments`
 * subcollection. Uploading a file whose name matches an EXISTING
 * attachment appends a new version instead of creating a duplicate
 * row — that's the "Version Support" requirement. Matching is by
 * exact file name, which is a reasonable proxy for "same file" in a
 * per-task attachment list without needing content hashing.
 */

export async function getAttachments(taskId: string): Promise<TaskAttachment[]> {
  const snapshot = await getDocs(taskAttachmentsCol(taskId));
  return snapshot.docs.map((d) => d.data());
}

export async function uploadAttachment(
  workspaceId: string,
  taskId: string,
  file: File,
  uploadedBy: TaskActor
): Promise<void> {
  const existing = await getAttachments(taskId);
  const match = existing.find((a) => a.fileName === file.name);

  const attachmentId = match?.id ?? doc(taskAttachmentsCol(taskId)).id;
  const versionNumber = (match?.versions.length ?? 0) + 1;

  const fileRef = taskAttachmentRef(workspaceId, taskId, attachmentId, versionNumber, file.name);
  const url = await uploadFile(fileRef, file);

  const version: AttachmentVersion = {
    versionNumber,
    url,
    storagePath: fileRef.fullPath,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };

  if (match) {
    await updateDoc(taskAttachmentDoc(taskId, attachmentId), {
      versions: [...match.versions, version],
    } as never);
    await logTaskActivity(taskId, uploadedBy, "attachment_new_version", `uploaded a new version of "${file.name}"`);
  } else {
    const attachment: TaskAttachment = {
      id: attachmentId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      versions: [version],
    };
    await setDoc(taskAttachmentDoc(taskId, attachmentId), attachment);
    await updateDoc(taskDoc(taskId), { attachmentCount: increment(1) });
    await logTaskActivity(taskId, uploadedBy, "attachment_added", `attached "${file.name}"`);
  }
}

/** Best-effort: removes every version's underlying Storage object — deleting an attachment used to only remove the Firestore doc, silently leaking the actual files. */
async function deleteAttachmentFiles(versions: AttachmentVersion[]): Promise<void> {
  await Promise.all(
    versions.map((v) =>
      deleteFile(fileRefFromPath(v.storagePath)).catch((err) =>
        console.error(`[attachmentService] Failed to delete storage file ${v.storagePath}:`, err)
      )
    )
  );
}

export async function deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
  const snapshot = await getDoc(taskAttachmentDoc(taskId, attachmentId));
  if (snapshot.exists()) await deleteAttachmentFiles(snapshot.data().versions);

  await deleteDoc(taskAttachmentDoc(taskId, attachmentId));
  await updateDoc(taskDoc(taskId), { attachmentCount: increment(-1) });
}

/** Used when a task itself is deleted — cleans up its whole attachments subcollection (Firestore never cascade-deletes subcollections on its own). */
export async function deleteAllAttachments(taskId: string): Promise<void> {
  const attachments = await getAttachments(taskId);
  await Promise.all(
    attachments.map(async (attachment) => {
      await deleteAttachmentFiles(attachment.versions);
      await deleteDoc(taskAttachmentDoc(taskId, attachment.id));
    })
  );
}
