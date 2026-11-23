"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onSnapshot } from "firebase/firestore";
import { settingsDoc, workspaceDoc } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { getWorkspaceEntitlements } from "@/services/billingService";
import { resolveFilePolicy } from "@/lib/entitlements";
import { PLATFORM_MAX_FILE_BYTES } from "@/lib/constants/uploadPolicy";
import type { UploadPolicy } from "@/lib/constants/creativeFiles";
import type { WorkspaceEntitlements } from "@/types/entitlements.types";

interface EntitlementsContextValue {
  /** The server-resolved entitlements for the ACTIVE workspace (null until loaded, or if it could not be resolved). */
  entitlements: WorkspaceEntitlements | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** What an upload in this workspace is checked against — from the resolved entitlements; while those load, from the same pure policy over the cached plan limits. */
  uploadPolicy: UploadPolicy;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

/**
 * ONE place the client learns what the active workspace is entitled to. It holds the server-resolved policy (/api/workspaces/entitlements) and
 * re-fetches it whenever anything that can change it changes: the workspace document (a Super Admin override re-derives its cached limits in the
 * same transaction as the write, and storage/seat counters change on every upload/join), or the workspace's own per-file setting. So an
 * override Super Admin saves reaches every open Settings page, the uploader's validation and the dashboard without a reload or a deploy.
 * The server still re-checks everything (finalize, quota reservation, invite acceptance) — this is for fast, friendly UX only.
 */
export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { workspaceId, workspace } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionKey, setVersionKey] = useState("");
  const generation = useRef(0);

  // Anything that can change the resolved policy shows up in one of these two documents.
  useEffect(() => {
    if (!workspaceId || !firebaseUser) {
      setVersionKey("");
      return;
    }
    let wsKey = "";
    let settingsKey = "";
    const publish = () => setVersionKey(`${workspaceId}|${wsKey}|${settingsKey}`);
    const unsubWs = onSnapshot(
      workspaceDoc(workspaceId),
      (snap) => {
        const d = snap.data();
        wsKey = d ? JSON.stringify([d.plan, d.subscriptionStatus, d.limits, d.storageBytesUsed, d.memberCount]) : "missing";
        publish();
      },
      () => undefined
    );
    const unsubSettings = onSnapshot(
      settingsDoc(workspaceId),
      (snap) => {
        settingsKey = String(snap.data()?.storage?.maxFileSizeMb ?? "");
        publish();
      },
      () => undefined
    );
    return () => {
      unsubWs();
      unsubSettings();
    };
  }, [workspaceId, firebaseUser]);

  const load = useCallback(async () => {
    if (!workspaceId || !firebaseUser) {
      setEntitlements(null);
      return;
    }
    const mine = ++generation.current;
    setIsLoading(true);
    try {
      const { entitlements: fresh } = await getWorkspaceEntitlements(workspaceId);
      if (mine !== generation.current) return; // a newer request (or a workspace switch) superseded this one
      setEntitlements(fresh);
      setError(null);
    } catch (err) {
      if (mine !== generation.current) return;
      setError(err instanceof Error ? err.message : "Couldn't load entitlements.");
    } finally {
      if (mine === generation.current) setIsLoading(false);
    }
  }, [workspaceId, firebaseUser]);

  // Switching workspace drops the previous workspace's policy immediately — it must never be applied to another workspace.
  useEffect(() => {
    generation.current++;
    setEntitlements(null);
    setError(null);
  }, [workspaceId]);

  useEffect(() => {
    if (versionKey) void load();
  }, [versionKey, load]);

  const uploadPolicy = useMemo<UploadPolicy>(() => {
    if (entitlements && entitlements.workspaceId === workspaceId) {
      return { maxFileBytes: entitlements.files.maxFileBytes, remainingStorageBytes: entitlements.storage.remainingBytes };
    }
    // Not loaded yet: the SAME pure policy function over the cached plan limits (display cache, re-derived server-side). Finalize re-checks anyway.
    const cachedStorage = workspace?.limits?.maxStorageBytes;
    const cachedUsed = workspace?.storageBytesUsed ?? 0;
    const file = resolveFilePolicy({ platformCeilingBytes: PLATFORM_MAX_FILE_BYTES, entitlementBytes: workspace?.limits?.maxFileEntitlementBytes ?? null, workspaceConfiguredMb: null });
    return {
      maxFileBytes: file.maxFileBytes,
      remainingStorageBytes: typeof cachedStorage === "number" && Number.isFinite(cachedStorage) ? Math.max(0, cachedStorage - cachedUsed) : null,
    };
  }, [entitlements, workspaceId, workspace]);

  const value = useMemo<EntitlementsContextValue>(() => ({ entitlements, isLoading, error, refresh: load, uploadPolicy }), [entitlements, isLoading, error, load, uploadPolicy]);
  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error("useEntitlements must be used inside <EntitlementsProvider>.");
  return ctx;
}
