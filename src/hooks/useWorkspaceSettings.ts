"use client";

import { useCallback, useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { settingsDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { updateWorkspaceSettings } from "@/services/settingsService";
import { logAudit } from "@/services/auditService";
import { WorkspaceSettings } from "@/types/settings.types";

/**
 * The single hook every Settings sub-page builds on: realtime
 * subscription to the workspace's one settings doc, plus a `save()`
 * that patches just the caller's slice through the existing
 * `updateWorkspaceSettings`. Centralizing this here is what lets
 * every settings page share the same load/save/error shape instead
 * of re-implementing onSnapshot + try/catch eleven times — and it's
 * also the single choke point every settings save passes through,
 * so logging a "settings_changed" audit entry here gives every
 * settings page audit coverage for free, with no per-page wiring.
 */
export function useWorkspaceSettings() {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setSettings(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(settingsDoc(workspaceId), (snapshot) => {
      setSettings(snapshot.exists() ? snapshot.data() : null);
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId]);

  const save = useCallback(
    async (patch: Partial<WorkspaceSettings>) => {
      if (!workspaceId) throw new Error("No active workspace.");
      setIsSaving(true);
      try {
        await updateWorkspaceSettings(workspaceId, patch);
        if (firebaseUser) {
          await logAudit({
            workspaceId,
            actor: {
              uid: firebaseUser.uid,
              displayName: profile?.displayName ?? firebaseUser.displayName ?? "Unknown",
              photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
              email: profile?.email ?? firebaseUser.email ?? "",
            },
            action: "settings_changed",
            targetType: "settings",
            targetId: Object.keys(patch).join(","),
            newValue: patch,
          });
        }
      } finally {
        setIsSaving(false);
      }
    },
    [workspaceId, firebaseUser, profile]
  );

  return { settings, isLoading, isSaving, save, workspaceId };
}
