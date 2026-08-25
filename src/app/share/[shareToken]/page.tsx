"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getDoc } from "firebase/firestore";
import { Lock, LogIn } from "lucide-react";
import { getFileByShareToken } from "@/services/fileService";
import { memberDoc } from "@/lib/firebase/firestore";
import { signInGuest } from "@/lib/firebase/auth";
import { useAuthContext } from "@/contexts/AuthContext";
import { SharedFileView } from "@/components/creative/review/SharedFileView";
import { Loader } from "@/components/ui/Loader";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectFile } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

type PageStatus = "loading" | "not-found" | "needs-signin" | "no-access" | "auth-failed" | "ready";

/**
 * Public, unauthenticated-friendly entry point for a link-shared file
 * (see FileShareSettings + ShareFileModal) — deliberately OUTSIDE the
 * (dashboard) route group so it never goes through ProtectedRoute/
 * MainLayout, which both assume a real signed-in project member. Auth/
 * Workspace/ThemeProvider still mount here (they're in the ROOT layout),
 * but all three already no-op gracefully when there's no signed-in user
 * or no resolvable workspace, so that's safe.
 *
 * Access resolution:
 *  - "anyone": works with no visible sign-in form.
 *  - "organization": requires a REAL signed-in account (not the
 *    anonymous session below) that's an actual member of the file's
 *    workspace — prompts to sign in (round-tripping back here via
 *    ?redirect=) if not, and shows a clear "you're signed in but not
 *    in this org" state if they are but aren't a member.
 * Either way, firestore.rules' isSharedFile/canCommentOnSharedFile are
 * the actual enforcement — this page's checks exist only to show a
 * clear message instead of a raw permission-denied.
 *
 * Auth bootstrap: `file_shares` (the token→file lookup — see
 * getFileByShareToken) requires `isSignedIn()`, so ANY visitor with no
 * existing session gets signed in anonymously first, before the lookup
 * even runs — invisibly, no form shown. That's just enough identity to
 * read the lookup doc and (for "anyone" links) attribute comments to a
 * stable uid; it does NOT satisfy "organization" access, which checks
 * `!firebaseUser.isAnonymous` below and still requires a real account.
 */
export default function SharedFilePage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = use(params);
  const { firebaseUser, profile, isLoading: isLoadingAuth } = useAuthContext();
  const [file, setFile] = useState<ProjectFile | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");

  useEffect(() => {
    if (isLoadingAuth || firebaseUser) return;
    signInGuest().catch((err) => {
      console.error("[share] anonymous sign-in failed:", err);
      // Only Anonymous sign-in being disabled in the Firebase Console (or a
      // network failure) lands here — without it, `firebaseUser` never
      // becomes truthy and the lookup effect below never runs, so this
      // page would otherwise spin on "loading" forever with no way out.
      setStatus((prev) => (prev === "loading" ? "auth-failed" : prev));
    });
  }, [isLoadingAuth, firebaseUser]);

  useEffect(() => {
    if (isLoadingAuth || !firebaseUser) return;
    let cancelled = false;
    getFileByShareToken(shareToken)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        if (!f || !f.shareSettings) setStatus("not-found");
      })
      .catch((err) => {
        console.error("[share] failed to resolve token:", err);
        if (!cancelled) setStatus("not-found");
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken, isLoadingAuth, firebaseUser]);

  useEffect(() => {
    if (!file || !file.shareSettings) return;
    const settings = file.shareSettings;
    let cancelled = false;

    (async () => {
      if (settings.visibility === "anyone") {
        if (!cancelled) setStatus("ready");
        return;
      }

      if (!firebaseUser || firebaseUser.isAnonymous) {
        if (!cancelled) setStatus("needs-signin");
        return;
      }
      try {
        const snap = await getDoc(memberDoc(file.workspaceId, firebaseUser.uid));
        if (!cancelled) setStatus(snap.exists() ? "ready" : "no-access");
      } catch {
        if (!cancelled) setStatus("no-access");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, firebaseUser]);

  if (status === "loading") {
    return (
      <div className="fixed inset-0 bg-background">
        <Loader fullScreen label="Opening shared file..." />
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <ErrorState title="This link doesn't work" message="It may have been turned off, or never existed." />
      </div>
    );
  }

  if (status === "auth-failed") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <ErrorState
          title="Couldn't open this link"
          message="Something went wrong verifying access. Check your connection and try again, or sign in if you have an account."
          onRetry={() => {
            setStatus("loading");
            signInGuest().catch((err) => {
              console.error("[share] anonymous sign-in retry failed:", err);
              setStatus("auth-failed");
            });
          }}
        />
      </div>
    );
  }

  if (status === "needs-signin") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <EmptyState
          icon={<LogIn className="h-9 w-9 text-foreground-muted" />}
          title="Sign in to view this"
          description="This file is shared with anyone in its organization — sign in with your account to continue."
          className="py-16"
          action={
            <Link
              href={`/login?redirect=${encodeURIComponent(`/share/${shareToken}`)}`}
              className="rounded-theme bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  if (status === "no-access") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <EmptyState
          icon={<Lock className="h-9 w-9 text-foreground-muted" />}
          title="You don't have access"
          description="This file is shared with members of a different organization. Ask the project owner to add you directly."
          className="py-16"
        />
      </div>
    );
  }

  if (!file || !file.shareSettings) return null;

  const actor: TaskActor | null = firebaseUser
    ? {
        uid: firebaseUser.uid,
        displayName: profile?.displayName ?? firebaseUser.displayName ?? (firebaseUser.isAnonymous ? "Guest" : "Unknown"),
        photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
        email: profile?.email ?? firebaseUser.email ?? "",
      }
    : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{file.fileName}</p>
          <p className="text-xs text-foreground-muted">Shared file · {file.shareSettings.permission === "comment" ? "Can comment" : "View only"}</p>
        </div>
        <Link href="/" className="shrink-0 text-xs font-medium text-primary hover:underline">
          Creative Studio
        </Link>
      </div>
      <SharedFileView asset={file} permission={file.shareSettings.permission} actor={actor} />
    </div>
  );
}
