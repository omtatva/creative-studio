import { getDocs, limit as fbLimit, orderBy, query } from "firebase/firestore";
import { platformAuditLogsCol } from "@/lib/firebase/firestore";
import type { PlatformAuditLogEntry } from "@/types/platformAudit.types";

/** Super Admin > Audit Logs — read-only, see platformAudit.types.ts. */
export async function getPlatformAuditLogs(take = 100): Promise<PlatformAuditLogEntry[]> {
  const q = query(platformAuditLogsCol(), orderBy("createdAt", "desc"), fbLimit(take));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}
