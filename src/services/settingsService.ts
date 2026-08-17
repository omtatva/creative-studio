import { getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { settingsDoc } from "@/lib/firebase/firestore";
import { WorkspaceSettings } from "@/types/settings.types";

/**
 * Generic read/patch for the one-doc-per-workspace settings model.
 * Individual Settings pages (Theme, Branding, Security, ...) call
 * `updateWorkspaceSettings(workspaceId, { theme: {...} })` with just
 * the slice they own — this foundation defines the shape only, no
 * page wires this up yet.
 */
export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null> {
  const snapshot = await getDoc(settingsDoc(workspaceId));
  return snapshot.exists() ? (snapshot.data() as WorkspaceSettings) : null;
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  patch: Partial<WorkspaceSettings>
): Promise<void> {
  await updateDoc(settingsDoc(workspaceId), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as never);
}
