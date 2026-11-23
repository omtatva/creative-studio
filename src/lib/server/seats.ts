import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { holdsSeat } from "@/lib/entitlements";

/**
 * The ONE seat counter. A seat is an ACTIVE member of any role (see holdsSeat in lib/entitlements.ts); disabled members and pending
 * invitations hold none, and neither does the platform Super Admin even when it has a member record in the workspace. External review
 * guests are never member records at all. Everything that needs "how many seats are used" — quota reservation/resync, invite acceptance,
 * re-enabling a member, plan-change checks, Settings > Users, Super Admin > Customers — goes through here.
 */

export interface SeatSummary {
  used: number;
  byRole: { owner: number; admin: number; member: number; viewer: number };
  disabled: number;
  superAdminMembers: number;
}

/** The platform Super Admin never takes a workspace seat. Reads the server-written platformRole. */
export async function superAdminUidSet(uids: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  if (unique.length === 0) return new Set();
  const docs = await adminDb().getAll(...unique.map((uid) => adminDb().collection("users").doc(uid)));
  return new Set(docs.filter((d) => d.exists && d.data()?.platformRole === "super_admin").map((d) => d.id));
}

export async function isPlatformSuperAdmin(uid: string): Promise<boolean> {
  return (await superAdminUidSet([uid])).has(uid);
}

export async function summarizeSeats(workspaceId: string): Promise<SeatSummary> {
  const snap = await adminDb().collection("members").where("workspaceId", "==", workspaceId).select("userId", "status", "role").get();
  const superAdmins = await superAdminUidSet(snap.docs.map((d) => String(d.data().userId)));
  const summary: SeatSummary = { used: 0, byRole: { owner: 0, admin: 0, member: 0, viewer: 0 }, disabled: 0, superAdminMembers: 0 };
  for (const d of snap.docs) {
    const data = d.data();
    const isSuper = superAdmins.has(String(data.userId));
    if (isSuper) summary.superAdminMembers++;
    if (!holdsSeat({ status: data.status }, isSuper)) {
      if (!isSuper && data.status === "suspended") summary.disabled++;
      continue;
    }
    summary.used++;
    const role = data.role as keyof SeatSummary["byRole"];
    if (role in summary.byRole) summary.byRole[role]++;
  }
  return summary;
}

export async function countSeatHolders(workspaceId: string): Promise<number> {
  return (await summarizeSeats(workspaceId)).used;
}
