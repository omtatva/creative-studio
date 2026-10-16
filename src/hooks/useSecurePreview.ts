"use client";

import { useEffect, useState } from "react";
import { createPreviewTicket, previewUrl } from "@/services/compareService";

export interface SecurePreview {
  /** Same-origin, ticketed media URL — null until issued (or if it was refused). Never the permanent Firebase token URL. */
  url: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Secure media URL for the NORMAL (single-version) review player. Asks the server for a preview ticket
 * (POST /api/files/preview — project access checked) and exposes the resulting /api/files/preview URL, which the
 * server re-authorizes on EVERY media request (including Range requests while scrubbing). Replaces the permanent
 * `file.url` Firebase token link, so removing someone from a project cuts off their playback on the next request
 * instead of leaving a copied URL working indefinitely.
 *
 * The ticket is re-issued shortly before it expires (rare — it lives hours — and switching the URL restarts the
 * player, so it only happens if a session outlasts the ticket).
 */
export function useSecurePreview(file: { id: string; workspaceId: string } | null | undefined): SecurePreview {
  const fileId = file?.id;
  const workspaceId = file?.workspaceId;
  const [state, setState] = useState<SecurePreview>({ url: null, isLoading: true, error: null });

  useEffect(() => {
    if (!fileId || !workspaceId) {
      setState({ url: null, isLoading: false, error: null });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const issue = async () => {
      try {
        const { ticket, expiresAtMs } = await createPreviewTicket(workspaceId, fileId);
        if (cancelled) return;
        setState({ url: previewUrl(ticket), isLoading: false, error: null });
        const refreshIn = Math.max(60_000, expiresAtMs - Date.now() - 5 * 60_000);
        timer = setTimeout(issue, refreshIn);
      } catch (err) {
        if (!cancelled) setState({ url: null, isLoading: false, error: err instanceof Error ? err.message : "Couldn't load the preview." });
      }
    };

    setState({ url: null, isLoading: true, error: null });
    void issue();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fileId, workspaceId]);

  return state;
}
