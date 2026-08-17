import { addDoc, getDocs, orderBy, query, limit, serverTimestamp } from "firebase/firestore";
import { notificationsCol } from "@/lib/firebase/firestore";

export interface NotificationPayload {
  title: string;
  body: string;
  read: boolean;
  link?: string;
}

/**
 * Per-user, per-workspace notification feed
 * (workspaces/{workspaceId}/notifications/{uid}/items).
 */
export async function pushNotification(
  workspaceId: string,
  uid: string,
  payload: NotificationPayload
): Promise<void> {
  await addDoc(notificationsCol(workspaceId, uid), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export async function getNotifications(workspaceId: string, uid: string, take = 20) {
  const q = query(notificationsCol(workspaceId, uid), orderBy("createdAt", "desc"), limit(take));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
