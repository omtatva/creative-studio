import { doc, getDocs, limit as fbLimit, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { auditLogsCol } from "@/lib/firebase/firestore";
import { AuditAction, AuditLogEntry } from "@/types/audit.types";
import { TaskActor } from "@/types/task.types";

interface LogAuditArgs {
  workspaceId: string;
  actor: TaskActor;
  action: AuditAction;
  targetType: string;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/**
 * Writes one audit entry. Captures what's genuinely available
 * client-side (user, timestamp, browser user-agent, action,
 * before/after) — `ipAddress` is always the placeholder below since
 * a client app cannot reliably determine its own public IP without
 * a server request context (see audit.types.ts for the full note).
 */
export async function logAudit({ workspaceId, actor, action, targetType, targetId, previousValue, newValue }: LogAuditArgs): Promise<void> {
  const docRef = doc(auditLogsCol());
  const entry: Omit<AuditLogEntry, "createdAt" | "updatedAt"> = {
    id: docRef.id,
    workspaceId,
    userId: actor.uid,
    userName: actor.displayName,
    action,
    targetType,
    targetId,
    ipAddress: "Not available (client-side app)",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    previousValue: previousValue !== undefined ? JSON.stringify(previousValue) : null,
    newValue: newValue !== undefined ? JSON.stringify(newValue) : null,
  };

  await setDoc(docRef, { ...entry, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function getAuditLogs(workspaceId: string, take = 100): Promise<AuditLogEntry[]> {
  const q = query(auditLogsCol(), where("workspaceId", "==", workspaceId), orderBy("createdAt", "desc"), fbLimit(take));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}
