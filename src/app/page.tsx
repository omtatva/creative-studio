"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { Loader } from "@/components/ui/Loader";
import { LandingPage } from "@/components/marketing/LandingPage";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Root `/` route: the public Omtatva Digitals landing page for
 * logged-out visitors, and a redirector to /dashboard for
 * authenticated ones. Kept out of the (dashboard) group since it
 * must work with NO session at all. No workspace-based branch here —
 * see ProtectedRoute's comment: a missing workspace is handled inline
 * wherever it matters (Projects' NoWorkspaceState + CreateWorkspaceModal),
 * not by redirecting before the app is even seen.
 */
export default function RootPage() {
  const router = useRouter();
  const { firebaseUser, isLoading } = useAuthContext();

  useEffect(() => {
    if (isLoading) return;
    if (firebaseUser) {
      router.replace(ROUTES.dashboard);
    }
  }, [isLoading, firebaseUser, router]);

  // Keep showing the loader while auth resolves AND during the brief
  // window after firebaseUser becomes truthy but before the redirect
  // above completes — otherwise an authenticated visitor would see a
  // flash of marketing content before being sent to /dashboard.
  if (isLoading || firebaseUser) return <Loader fullScreen />;
  return <LandingPage />;
}
