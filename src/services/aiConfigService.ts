import { deleteDoc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getCurrentUser } from "@/lib/firebase/auth";
import { aiConfigDoc } from "@/lib/firebase/firestore";
import { WorkspaceAIConfig } from "@/types/aiConfig.types";
import { AIProvider } from "@/types/settings.types";
import { TaskActor } from "@/types/task.types";

/**
 * Client-side wrapper around a workspace's own encrypted per-provider
 * API key (Gemini, NVIDIA, ...). The actual encryption/decryption
 * happens server-side (see src/lib/server/secretCrypto.ts and the
 * /api/settings/ai-key/* routes) — this file only ever handles
 * ciphertext, never the plaintext key.
 */

export async function getWorkspaceAIConfig(workspaceId: string, provider: AIProvider): Promise<WorkspaceAIConfig | null> {
  const snapshot = await getDoc(aiConfigDoc(workspaceId, provider));
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * Sends the plaintext key to the server ONCE for encryption, then
 * writes only the returned ciphertext to Firestore. The plaintext
 * never touches Firestore and is never sent back to this client.
 */
export async function saveWorkspaceAIKey(workspaceId: string, provider: AIProvider, apiKey: string, actor: TaskActor): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required.");

  // Server now requires sign-in (see the route's SECURITY doc comment
  // — it previously had none at all).
  const idToken = await getCurrentUser()?.getIdToken();
  const response = await fetch("/api/settings/ai-key/encrypt", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ apiKey: trimmed }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Couldn't save the API key.");
  }

  const config: Omit<WorkspaceAIConfig, "createdAt" | "updatedAt"> = {
    workspaceId,
    provider,
    ciphertext: data.ciphertext,
    iv: data.iv,
    authTag: data.authTag,
    keySuffix: data.keySuffix,
    updatedBy: actor.uid,
    updatedByName: actor.displayName,
  };
  await setDoc(aiConfigDoc(workspaceId, provider), { ...config, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
}

export async function clearWorkspaceAIKey(workspaceId: string, provider: AIProvider): Promise<void> {
  await deleteDoc(aiConfigDoc(workspaceId, provider));
}

/** Decrypts and makes a real, minimal call to the given provider server-side — never reports success just because a key is present. */
export async function testWorkspaceAIConnection(workspaceId: string, provider: AIProvider): Promise<{ ok: boolean; error: string | null }> {
  const config = await getWorkspaceAIConfig(workspaceId, provider);
  if (!config) {
    return { ok: false, error: "No API key configured for this workspace yet." };
  }
  try {
    // Server now requires sign-in (see the route's SECURITY doc
    // comment — it previously had none at all).
    const idToken = await getCurrentUser()?.getIdToken();
    const response = await fetch("/api/settings/ai-key/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify({ provider, ciphertext: config.ciphertext, iv: config.iv, authTag: config.authTag }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "Connection test failed." };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach the test endpoint." };
  }
}
