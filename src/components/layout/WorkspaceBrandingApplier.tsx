"use client";

import { useEffect } from "react";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";

/**
 * Applies the workspace's saved favicon (Settings > Branding) to the browser tab while that workspace is active. Renders nothing; with no
 * favicon saved the app's own icon stays. (The dashboard background is applied by MainLayout on the shell itself.)
 */
export function WorkspaceBrandingApplier() {
  const { settings } = useWorkspaceSettings();
  const faviconUrl = settings?.branding?.faviconUrl ?? null;

  useEffect(() => {
    if (!faviconUrl) return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"));
    const created = links.length === 0 ? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" })) : null;
    const targets = created ? [created] : links;
    const originals = targets.map((l) => l.getAttribute("href"));
    targets.forEach((l) => l.setAttribute("href", faviconUrl));
    return () => {
      targets.forEach((l, i) => {
        const original = originals[i];
        if (created) created.remove();
        else if (original) l.setAttribute("href", original);
      });
    };
  }, [faviconUrl]);

  return null;
}
