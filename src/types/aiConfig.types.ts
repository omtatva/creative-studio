import { ID, Timestamps } from "./common.types";
import { AIProvider } from "./settings.types";

/**
 * A workspace's own API key for one AI provider (Gemini, NVIDIA, ...),
 * encrypted at rest — see src/lib/server/secretCrypto.ts for how, and
 * src/services/aiConfigService.ts for the save/test flow.
 * `ciphertext`/`iv`/`authTag` are AES-256-GCM output: safe to read on
 * the client (it's cryptographic noise without
 * SETTINGS_ENCRYPTION_KEY, which never leaves the server), but the
 * client never decrypts it — only /api/settings/ai-key/test and
 * /api/ai-studio/generate do, and neither ever returns the plaintext
 * key to the browser.
 *
 * Document id is `${workspaceId}_${provider}` — a workspace can have
 * one key configured per provider at once (e.g. both a Gemini key and
 * an NVIDIA key), independent of which provider `AISettings.provider`
 * currently has selected for generation.
 */
export interface WorkspaceAIConfig extends Timestamps {
  workspaceId: ID;
  provider: AIProvider;
  ciphertext: string;
  iv: string;
  authTag: string;
  /** Last 4 characters of the real key, safe to show as "••••••••1234" — never enough to reconstruct the key. */
  keySuffix: string;
  updatedBy: ID;
  updatedByName: string;
}
