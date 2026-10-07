"use client";

import { useEffect } from "react";
import { usePlatformAppearance } from "@/hooks/usePlatformAppearance";
import { hexToRgbTriplet } from "@/lib/constants/projectAppearance";

const VARS = ["--project-header-primary", "--project-header-secondary", "--project-header-gradient-direction"] as const;

/**
 * Writes the platform's project-header design tokens onto <html> for the
 * authenticated app (mounted once in MainLayout). Renders nothing. With
 * no saved appearance the tokens are simply not set, so the defaults
 * declared in globals.css apply. Deliberately separate from ThemeContext's
 * workspace-branding variables: these three tokens are platform-wide and
 * never touched by per-workspace branding.
 */
export function ProjectAppearanceApplier() {
  const { appearance } = usePlatformAppearance();

  useEffect(() => {
    const root = document.documentElement;
    const style = appearance?.projectHeader;
    if (style) {
      root.style.setProperty("--project-header-primary", hexToRgbTriplet(style.primary));
      root.style.setProperty("--project-header-secondary", hexToRgbTriplet(style.secondary));
      root.style.setProperty("--project-header-gradient-direction", style.direction);
    } else {
      VARS.forEach((v) => root.style.removeProperty(v));
    }
    return () => VARS.forEach((v) => root.style.removeProperty(v));
  }, [appearance]);

  return null;
}
