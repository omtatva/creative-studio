"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, limit as fbLimit, doc, updateDoc } from "firebase/firestore";
import { notificationsCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { NotificationPayload } from "@/services/notificationService";

export interface NotificationWithId extends NotificationPayload {
  id: string;
  createdAt: string;
}

/**
 * Realtime read side of the Foundation's `notificationsCol` /
 * `pushNotification()` — previously written but never subscribed to
 * anywhere. Powers both /notifications and the Navbar bell dropdown.
 */
export function useNotifications(take = 30) {
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const [notifications, setNotifications] = useState<NotificationWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !firebaseUser) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(notificationsCol(workspaceId, firebaseUser.uid), orderBy("createdAt", "desc"), fbLimit(take));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as NotificationPayload & { createdAt: string }) })));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId, firebaseUser, take]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAsRead(notificationId: string) {
    if (!workspaceId || !firebaseUser) return;
    await updateDoc(doc(notificationsCol(workspaceId, firebaseUser.uid), notificationId), { read: true });
  }

  return { notifications, unreadCount, isLoading, markAsRead };
}
