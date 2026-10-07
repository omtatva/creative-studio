import { getCurrentUser } from "@/lib/firebase/auth";

/** What to download — always an id of a real record. The server resolves the actual object; the client never supplies a path or URL. */
export type DownloadTarget =
  | { kind: "file"; workspaceId: string; fileId: string }
  | { kind: "attachment"; workspaceId: string; taskId: string; attachmentId: string; versionNumber?: number };

/**
 * The ONE client download path (project Files, Creative Workspace review
 * page, version lists, Downloads page, task attachments). It asks
 * /api/files/download for a short-lived, single-use ticket — the server
 * checks sign-in, project access and the Feature Access `files.download`
 * permission — then lets the browser fetch the exact file/version as an
 * attachment. Throws an Error with a user-readable message when refused.
 */
export async function downloadFile(target: DownloadTarget): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/files/download", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(target),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't download this file.");

  const anchor = document.createElement("a");
  anchor.href = `/api/files/download?t=${encodeURIComponent(data.ticket)}`;
  anchor.download = data.fileName ?? "";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
