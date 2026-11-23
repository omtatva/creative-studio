/**
 * One DOWNLOAD HISTORY event. Written only by the server (Admin SDK) when an authorized download is handed out, and updated only by the server when it can actually
 * observe the outcome. Stored under `workspaces/{ws}/download_history/{uid}/items/{id}`; a user reads only their own feed. External reviewers' events live under the
 * reserved `_external` bucket, which no signed-in user can read, and carry no internal user data.
 *
 * Status honesty — handing out a signed URL is NOT a completed download:
 *   started    the server authorized the download and issued the link/ticket. For a DIRECT download (browser fetches the signed GCS URL, the server is not in the data
 *              path) this is the final state the server can know: it cannot observe whether the bytes arrived.
 *   completed  only for the PROXY path: the server streamed every byte of the object (byte count == object size) to the client.
 *   cancelled  proxy path: the client went away mid-stream.
 *   failed     proxy path: the stream broke, the object vanished, the byte count was wrong, or access was lost between ticket issue and redemption.
 *   expired    proxy path: the ticket was redeemed after its 60 s lifetime.
 * Unauthorized requests never create an event.
 */
export type DownloadStatus = "started" | "completed" | "cancelled" | "failed" | "expired";
export type DownloadMethod = "direct" | "proxy";

export interface DownloadEvent {
  id: string;
  kind: "file" | "attachment";
  actorType: "member" | "external";
  /** null for external reviewers */
  uid: string | null;
  workspaceId: string;
  projectId: string;
  fileId: string | null;
  taskId: string | null;
  attachmentId: string | null;
  assetGroupId: string | null;
  versionNumber: number | null;
  fileName: string;
  sizeBytes: number | null;
  method: DownloadMethod;
  status: DownloadStatus;
  /** short, safe reason for a non-success outcome */
  reason: string | null;
  /** epoch ms */
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}
