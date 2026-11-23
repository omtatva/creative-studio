"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Clock, Mail, MailWarning, RefreshCw, XCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import { classifyAcceptFailure } from "@/lib/auth/emailVerification";
import { getInviteById, acceptInvite } from "@/services/inviteService";
import { setActiveWorkspace } from "@/services/workspaceService";
import { WorkspaceInvite } from "@/types/workspace.types";
import { ROUTES, inviteRoute } from "@/lib/constants/routes";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; invite: WorkspaceInvite };

/**
 * Real accept-invite landing page — closes the loop the rest of the
 * invite flow (createInvite/getPendingInvites/cancelInvite in
 * inviteService.ts) never had: this is the only place a
 * `workspace_invites` doc actually turns into a real `members` doc.
 * See firestore.rules' isValidInviteAccept for the matching
 * server-side check (email must match the signed-in user's own
 * verified auth email — nothing here is trusted client-side alone).
 */
export default function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser, profile, isLoading: isAuthLoading, refreshProfile } = useAuthContext();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [isAccepting, setIsAccepting] = useState(false);
  const verification = useEmailVerification();

  useEffect(() => {
    if (isAuthLoading || !firebaseUser) return;
    let cancelled = false;
    setState({ status: "loading" });

    getInviteById(inviteId)
      .then((invite) => {
        if (cancelled) return;
        if (!invite) {
          setState({ status: "error", message: "This invite link isn't valid. Ask the person who invited you to send a new one." });
        } else if (invite.status === "accepted") {
          setState({ status: "error", message: "This invite has already been used. If that was you, just log in normally." });
        } else if (invite.status === "cancelled") {
          setState({ status: "error", message: "This invite was cancelled by a workspace admin." });
        } else if (new Date(invite.expiresAt).getTime() < Date.now()) {
          setState({ status: "error", message: "This invite has expired. Ask a workspace admin to resend it." });
        } else {
          setState({ status: "ready", invite });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const code = (err as { code?: string })?.code;
        setState({
          status: "error",
          message:
            code === "permission-denied"
              ? `This invite was sent to a different email address than the one you're signed in with (${firebaseUser.email}). Sign out and sign in with the invited email instead.`
              : "Couldn't load this invite. Please try again.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [inviteId, isAuthLoading, firebaseUser]);

  async function handleAccept(invite: WorkspaceInvite) {
    if (!firebaseUser || isAccepting) return; // a double click must not send two requests
    setIsAccepting(true);
    try {
      const actor = {
        uid: firebaseUser.uid,
        displayName: profile?.displayName ?? firebaseUser.displayName ?? "Unknown",
        photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
        email: profile?.email ?? firebaseUser.email ?? "",
      };
      await acceptInvite(invite, actor);
      await setActiveWorkspace(firebaseUser.uid, invite.workspaceId);
      await refreshProfile();
      toast.success(`You've joined ${invite.workspaceName}`);
      router.push(ROUTES.dashboard);
    } catch (err) {
      const failure = classifyAcceptFailure((err as { code?: string })?.code, (err as { status?: number })?.status);
      const message = err instanceof Error ? err.message : "Couldn't accept this invite. Please try again.";
      if (failure === "email_not_verified") {
        // The SERVER decided (it re-reads the Firebase Auth record) — its answer wins over whatever this browser had cached.
        verification.markUnverified();
      } else if (failure === "already_used") {
        setState({ status: "error", message: "This invite has already been used. If that was you, just log in normally." });
      } else if (failure === "cancelled") {
        setState({ status: "error", message: "This invite was cancelled by a workspace admin." });
      } else if (failure === "expired") {
        setState({ status: "error", message: "This invite has expired. Ask a workspace admin to resend it." });
      } else if (failure === "already_member") {
        setState({ status: "error", message: "You already belong to this workspace." });
      } else {
        toast.error(message);
      }
    } finally {
      setIsAccepting(false);
    }
  }

  if (isAuthLoading) {
    return <Loader fullScreen label="Loading..." />;
  }

  if (!firebaseUser) {
    const redirectTarget = inviteRoute(inviteId);
    return (
      <AuthLayout title="You've been invited" subtitle="Sign in or create an account to view and accept this invitation">
        <Card>
          <div className="flex flex-col gap-3">
            <Button className="w-full" onClick={() => router.push(`${ROUTES.login}?redirect=${encodeURIComponent(redirectTarget)}`)}>
              Sign in
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push(`${ROUTES.signup}?redirect=${encodeURIComponent(redirectTarget)}`)}
            >
              Create account
            </Button>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  if (state.status === "loading") {
    return <Loader fullScreen label="Loading invitation..." />;
  }

  if (state.status === "error") {
    return (
      <AuthLayout title="Invitation" subtitle="">
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="h-8 w-8 text-error" />
            <p className="text-sm text-foreground">{state.message}</p>
            <Link href={ROUTES.dashboard} className="text-sm font-medium text-primary hover:underline">
              Go to dashboard
            </Link>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  const { invite } = state;

  return (
    <AuthLayout title="You've been invited" subtitle={`Join ${invite.workspaceName} on Creative Studio`}>
      <Card>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-foreground-muted">
              <span className="font-medium text-foreground">{invite.invitedByName}</span> invited you to join
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">{invite.workspaceName}</p>
            <p className="mt-1 text-xs capitalize text-foreground-muted">as {invite.role}</p>
          </div>
          {verification.verified ? (
            <>
              <p className="flex items-center gap-1 text-xs text-success">
                <BadgeCheck className="h-3.5 w-3.5" />
                Email verified{firebaseUser.email ? `: ${firebaseUser.email}` : ""}
              </p>
              <Button className="w-full" isLoading={isAccepting} onClick={() => handleAccept(invite)}>
                Accept invitation
              </Button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-3 rounded-theme border border-warning/40 bg-warning/10 p-3 text-left" data-testid="verify-email-card">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MailWarning className="h-4 w-4 text-warning" />
                Email not verified
              </p>
              <p className="text-xs text-foreground-muted">
                To join <span className="font-medium text-foreground">{invite.workspaceName}</span> you must first confirm that{" "}
                <span className="font-medium text-foreground">{firebaseUser.email}</span> is your address. We sent a verification email to it — open the link in that
                email (check your spam folder too), then come back here and press <span className="font-medium">I&apos;ve verified — check again</span>.
              </p>
              {verification.message && (
                <p
                  role="status"
                  className={`text-xs ${verification.message.kind === "error" ? "text-error" : verification.message.kind === "success" ? "text-success" : "text-foreground-muted"}`}
                >
                  {verification.message.text}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" isLoading={verification.busy === "check"} disabled={verification.busy !== null} onClick={() => void verification.check()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  I&apos;ve verified — check again
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  isLoading={verification.busy === "resend"}
                  disabled={verification.busy !== null || verification.cooldownSeconds > 0}
                  onClick={() => void verification.resend()}
                >
                  {verification.cooldownSeconds > 0 ? `Resend email (${verification.cooldownSeconds}s)` : "Resend verification email"}
                </Button>
              </div>
            </div>
          )}
          <p className="flex items-center gap-1 text-xs text-foreground-muted">
            <Clock className="h-3 w-3" />
            Expires {new Date(invite.expiresAt).toLocaleDateString()}
          </p>
        </div>
      </Card>
    </AuthLayout>
  );
}
