import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { fileAnnotationsCol, fileAnnotationDoc } from "@/lib/firebase/firestore";
import { AnnotationData, AnnotationType, AssetAnnotation } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

/**
 * CRUD for a creative asset's `files/{fileId}/annotations`
 * subcollection — drawn shapes (circle/rectangle/arrow/freehand/text)
 * on the review canvas, distinct from plain comment markers (see
 * fileCommentService.ts). No shared "resolve" concept, so unlike
 * comments this is author-only write (enforced in Firestore rules).
 */

interface AddAnnotationArgs {
  workspaceId: string;
  projectId: string;
  fileId: string;
  version: number;
  author: TaskActor;
  type: AnnotationType;
  data: AnnotationData;
  color: string;
  timestampSeconds?: number | null;
  pageNumber?: number | null;
}

export async function addAnnotation({
  workspaceId,
  projectId,
  fileId,
  version,
  author,
  type,
  data,
  color,
  timestampSeconds = null,
  pageNumber = null,
}: AddAnnotationArgs): Promise<string> {
  const ref = doc(fileAnnotationsCol(fileId));

  const annotation: Omit<AssetAnnotation, "createdAt" | "updatedAt"> = {
    id: ref.id,
    workspaceId,
    projectId,
    fileId,
    version,
    authorId: author.uid,
    author,
    type,
    data,
    color,
    timestampSeconds,
    pageNumber,
  };

  await setDoc(ref, { ...annotation, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function deleteAnnotation(fileId: string, annotationId: string): Promise<void> {
  await deleteDoc(fileAnnotationDoc(fileId, annotationId));
}
