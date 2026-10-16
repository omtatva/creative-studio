import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { resolveProjectAccess, type ProjectAccess } from "@/lib/server/projectAccess";
import { isFeatureAllowed } from "@/lib/server/featureAccess";

/**
 * WHO may take part in a review — derived from the permission model the app already has, never a second one:
 *
 *   authenticated  +  active workspace member  +  project access (resolveProjectAccess)  =  CAN VIEW / COMMENT   (reviews.view / reviews.comment)
 *   ... +  a project role that can write (not a project Viewer)  +  the Feature Access grant `reviews.approve` for their
 *   workspace role                                                =  CAN MAKE A FORMAL DECISION
 *
 * `reviews.approve` defaults to Owner/Admin (today's behaviour) but is a normal Feature Access row, so Super Admin can grant
 * it to Employees without promoting anyone to workspace Admin.
 *
 * Re-evaluated on every call — a round remembers WHO was asked, never what they were allowed to do at the time.
 */
export interface ReviewerCapabilities {
  /** Has an active (not suspended / pending-invite) membership of the workspace — or is the platform Super Admin. */
  activeMember: boolean;
  /** Has an explicit project_members record (what the reviewer picker lists). Workspace Owner/Admin otherwise reach projects implicitly. */
  onProject: boolean;
  projectRole: string | null;
  access: ProjectAccess;
  canView: boolean;
  canDecide: boolean;
  displayName: string;
  photoURL: string | null;
}

export async function reviewerCapabilities(uid: string, workspaceId: string, projectId: string): Promise<ReviewerCapabilities> {
  const [access, memberSnap] = await Promise.all([resolveProjectAccess(uid, workspaceId, projectId), adminDb().collection("members").doc(`${workspaceId}_${uid}`).get()]);
  const member = memberSnap.exists ? memberSnap.data() : undefined;
  const memberOk = !!member && (member.status === undefined || member.status === "active");
  const activeMember = memberOk || access.isSuperAdmin;
  const canView = activeMember && access.canRead;
  const canDecide = canView && access.canWrite && (access.isSuperAdmin || (await isFeatureAllowed(access.workspaceRole, "reviews.approve")));
  return {
    activeMember, onProject: access.projectRole !== null, projectRole: access.projectRole, access, canView, canDecide,
    displayName: (member?.displayName as string | undefined) ?? "Teammate", photoURL: (member?.photoURL as string | null | undefined) ?? null,
  };
}

export interface EligibleReviewer { uid: string; displayName: string; photoURL: string | null; projectRole: string | null; canDecide: boolean }

/**
 * The internal reviewer picker for ONE project: people with an explicit project membership who can currently open it.
 * Never "every workspace member" — an Employee on Project B is not offered for Project A. No email addresses are returned.
 */
export async function listEligibleReviewers(workspaceId: string, projectId: string): Promise<EligibleReviewer[]> {
  const snap = await adminDb().collection("project_members").where("projectId", "==", projectId).get();
  const out: EligibleReviewer[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.workspaceId !== undefined && data.workspaceId !== workspaceId) continue;
    const uid = (data.uid as string | undefined) ?? d.id.slice(projectId.length + 1);
    const caps = await reviewerCapabilities(uid, workspaceId, projectId);
    if (!caps.canView || !caps.onProject) continue;
    out.push({ uid, displayName: caps.displayName, photoURL: caps.photoURL, projectRole: caps.projectRole, canDecide: caps.canDecide });
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
