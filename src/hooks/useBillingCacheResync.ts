"use client";

import { useEffect, useState } from "react";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getAllWorkspaceSubscriptions } from "@/services/subscriptionService";
import { resyncBillingCache } from "@/services/billingService";
import { billingCacheIsStale } from "@/lib/billingDisplay";
import type { WorkspaceSubscription } from "@/types/billing.types";
import type { Workspace } from "@/types/workspace.types";

/**
 * Once per workspace per page session — a resync is idempotent, so
 * this is only to stop a stale-looking doc from re-triggering it on
 * every render/refresh while the (cheap) server call is in flight or
 * if it fails. A fresh page load tries again.
 */
const attempted = new Set<string>();

export async function requestBillingResync(workspaceId: string): Promise<boolean> {
  if (attempted.has(workspaceId)) return false;
  attempted.add(workspaceId);
  const result = await resyncBillingCache(workspaceId);
  if (!result.ok) console.error("[billing] cache resync failed:", workspaceId, result.error);
  return result.ok;
}

/**
 * Lazy repair of the ACTIVE workspace's billing display cache. When
 * the cache disagrees with the authoritative state (an expired trial
 * still cached as "trialing"), asks the server to resync — the client
 * never writes billing state itself — then reloads the workspace doc
 * so cache-based surfaces update. `subscription` follows
 * billingDisplay.ts: a subscription (authoritative), `null` (known to
 * not exist), or `undefined` (unknown — still loading, or this viewer
 * can't read subscriptions, e.g. a plain member), in which case only
 * the cache-only staleness checks apply. A resync is always safe: the
 * server resolves from the authoritative subscription.
 */
export function useBillingCacheResync(workspace: Workspace | null, subscription: WorkspaceSubscription | null | undefined) {
  const { refreshWorkspace } = useWorkspaceContext();

  useEffect(() => {
    if (!workspace) return;
    if (!billingCacheIsStale(workspace, subscription)) return;
    requestBillingResync(workspace.id).then((ok) => {
      if (ok) void refreshWorkspace();
    });
    // refreshWorkspace is a fresh closure each render; the attempt set above is the loop guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, subscription]);
}

/**
 * Super Admin surfaces that list many workspaces: loads every
 * workspace's subscription once (they render from these — authoritative,
 * live expiry — not the cache) and, for any workspace whose cache is
 * stale, asks the server to repair it in the background so everything
 * else reading that cache converges too. Super Admin only — the
 * cross-workspace read is gated by firestore.rules.
 */
export function useAllWorkspaceSubscriptions(workspaces: Workspace[]) {
  const [byWorkspaceId, setByWorkspaceId] = useState<Record<string, WorkspaceSubscription> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllWorkspaceSubscriptions()
      .then((subs) => {
        if (cancelled) return;
        const map: Record<string, WorkspaceSubscription> = {};
        subs.forEach((s) => {
          map[s.workspaceId] = s;
        });
        setByWorkspaceId(map);
      })
      .catch((err) => {
        console.error("[billing] failed to load subscriptions:", err);
        if (!cancelled) setByWorkspaceId({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!byWorkspaceId) return;
    workspaces.forEach((workspace) => {
      if (billingCacheIsStale(workspace, byWorkspaceId[workspace.id] ?? null)) void requestBillingResync(workspace.id);
    });
  }, [byWorkspaceId, workspaces]);

  return { byWorkspaceId, isLoading: byWorkspaceId === null };
}
