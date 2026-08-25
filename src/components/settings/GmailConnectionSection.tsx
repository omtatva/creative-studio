"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useToast } from "@/hooks/useToast";
import { disconnectGmail, getGmailAuthUrl, getGmailConnectionStatus } from "@/services/gmailConnectionService";
import { GmailConnectionStatus } from "@/types/gmail.types";

const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  denied: "Gmail connection was cancelled.",
  invalid_state: "The connection attempt expired or was invalid. Try connecting again.",
  // token_exchange_failed and userinfo_failed both mean the OAuth
  // round trip itself didn't complete successfully (code-for-token
  // exchange rejected, or the identity lookup that followed it
  // failed) — the real cause (invalid_grant, redirect_uri_mismatch,
  // insufficient scope, ...) is logged server-side (see
  // callback/route.ts) but deliberately not detailed here, since none
  // of those specifics are actionable for the end user — "reconnect"
  // is the correct next step regardless of which one it was.
  token_exchange_failed: "Gmail connection failed. Please reconnect your Google account.",
  no_refresh_token: "Google didn't grant lasting access. Try connecting again.",
  userinfo_failed: "Gmail connection failed. Please reconnect your Google account.",
  storage_failed: "Couldn't save the Gmail connection. Try again.",
  server_not_configured: "Gmail connect isn't configured on the server yet.",
  google_error: "Google returned an error. Try again.",
};

/**
 * Per-user (not per-workspace) Gmail connection, used by
 * src/app/api/invites/send/route.ts to send workspace invitations
 * FROM whoever's connected account created them. Every signed-in
 * user manages only their own connection — there's no "workspace's
 * shared Gmail" concept, matching the server-side model in
 * gmail_connections/{uid} (see gmail.types.ts).
 */
export function GmailConnectionSection() {
  const toast = useToast();
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getGmailConnectionStatus();
      setStatus(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load Gmail connection status.");
    } finally {
      setIsLoading(false);
    }
    // toast identity isn't stable across renders (see useToast.ts) —
    // intentionally excluded so this doesn't re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();

    // Reads the OAuth-callback result off plain browser query params
    // (NOT next/navigation's useSearchParams — this page doesn't need
    // a Suspense boundary just for a one-time toast), then strips it
    // from the URL so refreshing the page doesn't re-show it.
    const params = new URLSearchParams(window.location.search);
    const gmailResult = params.get("gmail");
    if (gmailResult === "connected") {
      toast.success("Gmail connected.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (gmailResult === "error") {
      const reason = params.get("reason") ?? "";
      toast.error(GMAIL_ERROR_MESSAGES[reason] ?? "Couldn't connect Gmail. Try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const authUrl = await getGmailAuthUrl();
      window.location.href = authUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the Gmail connection.");
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      await disconnectGmail();
      toast.success("Gmail disconnected.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect Gmail.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <SettingsSection
      title="Your Gmail connection"
      description="Connect your own Gmail account so invitations you send come from your address, not a shared sender."
    >
      {isLoading ? (
        <Loader label="Checking Gmail connection..." />
      ) : status?.connected ? (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">Connected as {status.email}</p>
            <p className="text-xs text-foreground-muted">Invitations you send will come from this address.</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleDisconnect} isLoading={isDisconnecting}>
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">No Gmail account connected</p>
            <p className="text-xs text-foreground-muted">Connect Gmail to send invitations from your own address.</p>
          </div>
          <Button size="sm" onClick={handleConnect} isLoading={isConnecting}>
            Connect Gmail
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}
