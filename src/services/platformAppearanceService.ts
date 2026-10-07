import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { getCurrentUser } from "@/lib/firebase/auth";
import { subscribeSharedDoc } from "@/lib/firebase/sharedDocSubscription";
import type { PlatformAppearanceDoc, ProjectHeaderStyle } from "@/lib/constants/projectAppearance";

const appearanceRef = () => doc(db, "platform_settings", "appearance");

/** Realtime, shared read (any signed-in user — every project header needs it). `null` = never saved. */
export function subscribeAppearance(onValue: (appearance: PlatformAppearanceDoc | null) => void, onError: (err: Error) => void): () => void {
  return subscribeSharedDoc<PlatformAppearanceDoc>(appearanceRef(), onValue, onError);
}

/** Super-Admin-only (verified server-side, not here). `applyToExisting` stamps the single global "applied to all" timestamp — no project documents are written. */
export async function saveProjectHeaderAppearance(projectHeader: ProjectHeaderStyle, applyToExisting: boolean): Promise<PlatformAppearanceDoc> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/platform-settings/appearance", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ projectHeader, applyToExisting }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Couldn't save appearance.");
  return data.appearance as PlatformAppearanceDoc;
}
