import { getCurrentUser } from "@/lib/firebase/auth";

/** Ask the server to re-queue background processing of a failed video. Throws a user-readable Error if refused. */
export async function retryVideoProcessing(workspaceId: string, fileId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/files/processing", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ workspaceId, fileId, action: "retry" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't retry processing.");
}
