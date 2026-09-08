"use client";

import { useEffect } from "react";

const RELOAD_FLAG_KEY = "__chunk_recovery_reloaded_at";
const RELOAD_COOLDOWN_MS = 10_000;

function looksLikeChunkLoadError(message: unknown): boolean {
  if (typeof message !== "string") return false;
  return /ChunkLoadError|Loading chunk [\d]+ failed|failed to fetch dynamically imported module|error loading dynamically imported module/i.test(message);
}

/**
 * Recovers from a very specific, easy-to-misdiagnose-as-"nothing
 * happens" failure mode: a browser tab left open across an App
 * Hosting deploy holds a client-side bundle whose route chunk/RSC
 * references point at build artifacts the server no longer serves.
 * Next.js's client router doesn't show any visible error for this —
 * clicking a <Link> to a not-yet-visited route just silently fails to
 * navigate, which reads exactly like "the button doesn't work."
 *
 * This listens for the browser's own error signals for a failed
 * dynamic import/chunk fetch and does ONE full reload to pick up the
 * new build — never more than once per short window (sessionStorage
 * flag), so a REAL persistent error can't trigger a reload loop. Pure
 * client-side reliability plumbing: touches no auth, routing, or
 * authorization logic, and every account gets the same recovery, not
 * just Super Admin.
 */
export function ChunkErrorRecovery() {
  useEffect(() => {
    function recoverIfChunkError(message: unknown) {
      if (!looksLikeChunkLoadError(message)) return;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) ?? 0);
      } catch {
        // sessionStorage unavailable (privacy mode) - fall through and reload anyway, just without the cooldown guard.
      }
      if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
      try {
        sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
      } catch {
        // Ignore - see above.
      }
      window.location.reload();
    }

    function onError(event: ErrorEvent) {
      recoverIfChunkError(event?.message);
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event?.reason;
      recoverIfChunkError(typeof reason === "string" ? reason : reason?.message);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
