"use client";

import { use } from "react";
import { ExternalReviewView } from "@/components/review/ExternalReviewView";

/**
 * Public client-review page. Deliberately OUTSIDE the (dashboard) route group:
 * no sidebar, navbar, workspace switcher, settings, billing, projects list or
 * Team — and no Firebase sign-in at all. Everything it shows comes from
 * /api/review/*, which authorizes each call from the link itself.
 */
export default function ExternalReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <div className="app-shell fixed inset-0 flex flex-col bg-background text-foreground">
      <ExternalReviewView token={token} />
    </div>
  );
}
