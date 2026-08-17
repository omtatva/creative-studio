import { addDoc, serverTimestamp, orderBy, limit, query, getDocs } from "firebase/firestore";
import { activityLogsCol } from "@/lib/firebase/firestore";

export interface ActivityLogEntry {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
}

/**
 * Append-only audit trail, scoped per workspace via subcollection
 * path (workspaces/{workspaceId}/activity_logs). Powers the
 * dashboard's "Recent Activity" card once wired up.
 */
export async function logActivity(workspaceId: string, entry: ActivityLogEntry): Promise<void> {
  await addDoc(activityLogsCol(workspaceId), {
    ...entry,
    createdAt: serverTimestamp(),
  });
}

export async function getRecentActivity(workspaceId: string, take = 10) {
  const q = query(activityLogsCol(workspaceId), orderBy("createdAt", "desc"), limit(take));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
