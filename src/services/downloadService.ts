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
const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

export async function downloadFile(target: DownloadTarget): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/files/download", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    // One id per click: a retried/duplicated request maps to the SAME history event server-side.
    body: JSON.stringify({ ...target, requestId: newRequestId() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't download this file.");

  // Direct (signed GCS URL, original bytes straight from storage) or, as a fallback, the ticketed server stream.
  const anchor = document.createElement("a");
  anchor.href = typeof data.url === "string" ? data.url : `/api/files/download?t=${encodeURIComponent(data.ticket)}`;
  anchor.download = data.fileName ?? "";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
