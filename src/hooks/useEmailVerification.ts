"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { refreshEmailVerified, resendVerificationEmail } from "@/lib/firebase/auth";
import { cooldownRemainingMs, initialLastSentAt, mapVerificationError } from "@/lib/auth/emailVerification";

export type VerificationMessage = { kind: "info" | "success" | "error"; text: string } | null;

/**
 * State + actions for the "verify your email" step of accepting an invitation:
 *  - `verified`        what the browser currently believes (decides which screen to show — the server re-verifies independently)
 *  - `resend()`        sends another verification email; blocked while one is in flight or inside the cooldown
 *  - `check()`         reload()s the Firebase user + refreshes the ID token, then re-reads `emailVerified`
 *  - `markUnverified()` the server said EMAIL_NOT_VERIFIED, so the server's answer wins over the cached flag
 */
export function useEmailVerification() {
  const { firebaseUser } = useAuthContext();
  const [verified, setVerified] = useState<boolean>(firebaseUser?.emailVerified === true);
  const [lastSentAt, setLastSentAt] = useState<number | null>(() => initialLastSentAt(firebaseUser?.metadata?.creationTime));
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<"resend" | "check" | null>(null);
  const [message, setMessage] = useState<VerificationMessage>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setVerified(firebaseUser?.emailVerified === true);
  }, [firebaseUser]);

  const remainingMs = cooldownRemainingMs(lastSentAt, now);
  useEffect(() => {
    if (remainingMs <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [remainingMs]);

  const resend = useCallback(async () => {
    if (inFlight.current || cooldownRemainingMs(lastSentAt, Date.now()) > 0) return;
    inFlight.current = true;
    setBusy("resend");
    setMessage(null);
    try {
      await resendVerificationEmail();
      const sentAt = Date.now();
      setLastSentAt(sentAt);
      setNow(sentAt);
      setMessage({ kind: "success", text: "Verification email sent. Check your inbox (and spam folder), then click the link in it." });
    } catch (err) {
      // A rate-limit answer from Firebase also starts the cooldown, so the button doesn't invite an immediate retry.
      if ((err as { code?: string })?.code === "auth/too-many-requests") {
        setLastSentAt(Date.now());
        setNow(Date.now());
      }
      setMessage({ kind: "error", text: mapVerificationError(err) });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }, [lastSentAt]);

  const check = useCallback(async () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy("check");
    setMessage(null);
    try {
      const ok = await refreshEmailVerified();
      setVerified(ok);
      setMessage(ok ? { kind: "success", text: "Your email is verified." } : { kind: "info", text: "Not verified yet. Open the link in the verification email, then check again." });
      return ok;
    } catch (err) {
      setMessage({ kind: "error", text: mapVerificationError(err) });
      return false;
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }, []);

  const markUnverified = useCallback((text?: string) => {
    setVerified(false);
    setMessage({ kind: "info", text: text ?? "Your email address isn't verified yet. Verify it, then accept the invitation." });
  }, []);

  return { verified, busy, message, cooldownSeconds: Math.ceil(remainingMs / 1000), resend, check, markUnverified };
}
