"use client";

import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { effectiveMaxFileBytes } from "@/lib/constants/creativeFiles";

/**
 * The per-file upload limit for the active workspace, live: the owner/admin's setting from Settings > Storage (realtime), capped by the
 * platform ceiling. A change saved there applies to the next upload immediately. The server re-enforces it in /api/files/finalize, so this
 * is only the fast, friendly pre-check.
 */
export function useUploadLimit(): number {
  const { settings } = useWorkspaceSettings();
  return effectiveMaxFileBytes(settings?.storage?.maxFileSizeMb);
}
