"use client";

import { useEffect, useState } from "react";
import { createPreviewTicket, previewUrl, PreviewError } from "@/services/compareService";

export interface SecurePreview {
  /** Same-origin, ticketed media URL — null until issued (or if it was refused). Never the permanent Firebase token URL. */
  url: string | null;
  isLoading: boolean;
  error: string | null;
  /** "proxy" when playback uses the verified lower-resolution proxy; "original" otherwise. Downloads are unaffected (always the original). */
  variant: "proxy" | "original" | null;
  /** If the proxy can't play, switch to the original file for this session. */
  fallbackToOriginal: () => void;
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
  const [state, setState] = useState<Omit<SecurePreview, "fallbackToOriginal">>({ url: null, isLoading: true, error: null, variant: null });
  const [forceOriginal, setForceOriginal] = useState(false);

  useEffect(() => {
    if (!fileId || !workspaceId) {
      setState({ url: null, isLoading: false, error: null, variant: null });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const issue = async () => {
      try {
        const { ticket, expiresAtMs, variant } = await createPreviewTicket(workspaceId, fileId, forceOriginal ? "original" : undefined);
        if (cancelled) return;
        setState({ url: previewUrl(ticket), isLoading: false, error: null, variant: variant ?? "original" });
        const refreshIn = Math.max(60_000, expiresAtMs - Date.now() - 5 * 60_000);
        timer = setTimeout(issue, refreshIn);
      } catch (err) {
        if (cancelled) return;
        const code = err instanceof PreviewError ? err.code : "TICKET_CREATE_FAILED";
        const message = err instanceof Error ? err.message : "Couldn't load the preview.";
        // The friendly message stays; in development the failing STEP is shown too (never a token, ticket or URL). The page never falls back to the permanent file URL.
        if (process.env.NODE_ENV !== "production") console.warn(`[useSecurePreview] ${code}: ${message}`);
        setState({ url: null, isLoading: false, error: process.env.NODE_ENV !== "production" ? `${message} (${code})` : message, variant: null });
      }
    };

    setState((s) => ({ ...s, url: null, isLoading: true, error: null }));
    void issue();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fileId, workspaceId, forceOriginal]);

  return { ...state, fallbackToOriginal: () => setForceOriginal(true) };
}
