"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, signup, logout, sendPasswordReset } from "@/services/authService";
import { useAuthContext } from "@/contexts/AuthContext";
import { AuthCredentials, SignupPayload } from "@/types/user.types";
import { ROUTES } from "@/lib/constants/routes";

/**
 * UI-facing auth hook: wraps authService calls with loading/error
 * state and post-action navigation, so form components stay
 * declarative (see app/login/page.tsx).
 */
export function useAuth() {
  const router = useRouter();
  const { firebaseUser, profile, isLoading: isSessionLoading } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(credentials: AuthCredentials, redirectTo?: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      await login(credentials);
      router.push(redirectTo || ROUTES.dashboard);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // redirectTo lets an invite link (see app/invite/[inviteId]/page.tsx)
  // route a brand-new user back to accept their invite instead of the
  // default "create your own workspace" flow — every other caller
  // omits it and keeps today's behavior exactly.
  async function handleSignup(payload: SignupPayload, redirectTo?: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      await signup(payload);
      router.push(redirectTo || ROUTES.workspaceCreate);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    setIsSubmitting(true);
    try {
      await logout();
      router.push(ROUTES.home);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword(email: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      return true;
    } catch (err) {
      setError(mapAuthError(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    firebaseUser,
    profile,
    isSessionLoading,
    isSubmitting,
    error,
    login: handleLogin,
    signup: handleSignup,
    logout: handleLogout,
    forgotPassword: handleForgotPassword,
  };
}

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/email-already-in-use": "An account with that email already exists.",
    "auth/weak-password": "Password is too weak.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}
