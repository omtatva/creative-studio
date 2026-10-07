"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeAppearance } from "@/services/platformAppearanceService";
import { projectFollowsPlatformHeader, type PlatformAppearanceDoc } from "@/lib/constants/projectAppearance";

/**
 * Live (shared-listener) platform appearance. `followsPlatformHeader`
 * answers, for ONE project, whether it renders the platform project
 * header style or its legacy `project.color` gradient — derived at
 * render time from the single platform doc, so "Apply to Existing
 * Projects" needs no per-project writes (see projectAppearance.ts).
 * Until the doc has loaded, or if it can't be read, every project keeps
 * its legacy look — never a flash of a style that might not apply.
 */
export function usePlatformAppearance() {
  const [appearance, setAppearance] = useState<PlatformAppearanceDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeAppearance(
      (value) => {
        setAppearance(value);
        setIsLoading(false);
      },
      (err) => {
        console.error("[usePlatformAppearance] couldn't read platform appearance — projects keep their own colors:", err);
        setIsLoading(false);
      }
    );
  }, []);

  const followsPlatformHeader = useCallback(
    (project: { createdAt: string }) => projectFollowsPlatformHeader(project, appearance),
    [appearance]
  );

  return { appearance, isLoading, followsPlatformHeader };
}
