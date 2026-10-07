"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, limit as fbLimit, doc, updateDoc } from "firebase/firestore";
import { notificationsCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAccessibleProjectIds } from "@/hooks/useAccessibleProjectIds";
import { NotificationPayload } from "@/services/notificationService";

export interface NotificationWithId extends NotificationPayload {
  id: string;
  createdAt: string;
}

/**
 * Realtime read side of the per-user notification feed (written only by
 * the server — see lib/server/notifications.ts). Powers both /notifications
 * and the Navbar bell dropdown, so unread state is one source of truth.
 */
export function useNotifications(take = 30) {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const { projectIds: accessibleProjectIds, isLoading: isLoadingAccess } = useAccessibleProjectIds();
  const [allNotifications, setNotifications] = useState<NotificationWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !firebaseUser) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(notificationsCol(workspaceId, firebaseUser.uid), orderBy("createdAt", "desc"), fbLimit(take));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setNotifications(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as NotificationPayload & { createdAt: string }) })));
        setIsLoading(false);
      },
      (err) => {
        console.error("[useNotifications] snapshot error:", err);
        setNotifications([]);
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [workspaceId, firebaseUser, take]);

  // A notification about a project the user can no longer open (removed from it) is hidden — in
  // the list AND the unread count — so history never keeps advertising that project. `null` =
  // workspace-wide access (owner/admin/Super Admin), nothing to filter. The link itself is never
  // an authorization bypass either: the destination page enforces project access on its own.
  const notifications = allNotifications.filter((n) => {
    if (!n.projectId || accessibleProjectIds === null) return true;
    return !isLoadingAccess && accessibleProjectIds.includes(n.projectId);
  });
  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAsRead(notificationId: string) {
    if (!workspaceId || !firebaseUser) return;
    await updateDoc(doc(notificationsCol(workspaceId, firebaseUser.uid), notificationId), { read: true });
  }

  return { notifications, unreadCount, isLoading, markAsRead };
}
