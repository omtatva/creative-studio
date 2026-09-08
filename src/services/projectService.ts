import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { getCurrentUser } from "@/lib/firebase/auth";
import { projectsCol, projectDoc, projectMembersCol, projectMemberDoc } from "@/lib/firebase/firestore";
import { deleteFile, projectCoverRef, uploadFile } from "@/lib/firebase/storage";
import { logActivity } from "@/services/activityService";
import { getOrCreateDefaultStage } from "@/services/stageService";
import {
  CreateProjectPayload,
  Project,
  ProjectMember,
  ProjectMembership,
  UpdateProjectPayload,
} from "@/types/project.types";

export class ProjectQuotaError extends Error {
  code: "PROJECT_LIMIT_REACHED";
  constructor(message: string) {
    super(message);
    this.code = "PROJECT_LIMIT_REACHED";
  }
}

/**
 * Calls a /api/projects/* route with the caller's own ID token — see
 * that route's doc comment for what moved server-side and why
 * (maxProjects can't be enforced atomically from the client SDK at
 * all; Firestore rules have no aggregate-count primitive).
 */
async function callProjectApi<T>(path: string, body: unknown): Promise<T> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data?.code === "PROJECT_LIMIT_REACHED") throw new ProjectQuotaError(data.error);
    throw new Error(typeof data?.error === "string" ? data.error : "Request failed.");
  }
  return data as T;
}

/**
 * Writes/updates the REAL access-control record for one project
 * membership — see ProjectMembership's doc comment in
 * project.types.ts for why this is separate from the denormalized
 * `Project.members[]` array. Every function below that touches
 * project membership calls this alongside its existing array
 * mutation, so nothing that already reads `project.members` for
 * display needs to change.
 */
async function upsertProjectMembership(params: {
  projectId: string;
  workspaceId: string;
  uid: string;
  role: ProjectMember["role"];
  addedBy: string;
}): Promise<void> {
  const { projectId, workspaceId, uid, role, addedBy } = params;
  const docRef = projectMemberDoc(projectId, uid);
  const existing = await getDoc(docRef);
  await setDoc(
    docRef,
    {
      id: `${projectId}_${uid}`,
      projectId,
      workspaceId,
      uid,
      role,
      permissions: [],
      addedBy,
      updatedAt: serverTimestamp(),
      ...(existing.exists() ? {} : { addedAt: serverTimestamp() }),
    } as never,
    { merge: true }
  );
}

/**
 * All project reads/writes live here, and EVERY function takes a
 * `workspaceId` and filters/asserts against it — this is the single
 * enforcement point for tenant isolation on projects (mirrors
 * firebase-config/firestore.rules, which independently rejects any
 * cross-workspace access at the database level).
 */

interface CreateProjectArgs {
  workspaceId: string;
  owner: ProjectMember;
  payload: CreateProjectPayload;
}

export async function createProject({ workspaceId, owner, payload }: CreateProjectArgs): Promise<string> {
  // The actual project document is now created server-side (see
  // /api/projects/create) — the ONLY place maxProjects can be checked
  // atomically. Everything below (cover upload, project_members,
  // activity log, default stage) is unchanged, best-effort follow-up
  // work using the projectId the server just created.
  const { projectId } = await callProjectApi<{ projectId: string }>("/api/projects/create", {
    workspaceId,
    name: payload.name,
    description: payload.description,
    color: payload.color,
    icon: payload.icon,
    statusId: payload.statusId,
    priorityId: payload.priorityId,
    startDate: payload.startDate,
    dueDate: payload.dueDate,
    tags: payload.tags,
    ownerDisplayName: owner.displayName,
    ownerPhotoURL: owner.photoURL,
    ownerEmail: owner.email,
  });

  try {
    // The creator becomes a real, queryable project member — NOT
    // every workspace member (see ProjectMembership's doc comment) —
    // so they can immediately see/open the project they just made
    // under the new membership-filtered visibility model. Done BEFORE
    // the cover upload below: a non-admin "member"-role creator's
    // Storage write is only authorized once this record exists (see
    // storage.rules' canWriteProjectFiles), so uploading first would
    // fail for exactly that role.
    await upsertProjectMembership({ projectId, workspaceId, uid: owner.uid, role: "owner", addedBy: owner.uid });
  } catch (err) {
    console.error("[projectService.createProject] owner project_members write failed (project was still created):", err);
  }

  if (payload.coverImageFile) {
    try {
      const coverRef = projectCoverRef(workspaceId, projectId, payload.coverImageFile.name);
      const coverImageUrl = await uploadFile(coverRef, payload.coverImageFile);
      await updateDoc(projectDoc(projectId), { coverImageUrl, updatedAt: serverTimestamp() });
    } catch (err) {
      // The project already exists at this point — a cover-image
      // failure must not be reported as the whole creation failing.
      console.error("[projectService.createProject] cover image upload failed (project was still created):", err);
    }
  }

  try {
    await logActivity(workspaceId, {
      actorId: owner.uid,
      actorName: owner.displayName,
      action: `created project "${payload.name}"`,
      targetType: "project",
      targetId: projectId,
    });
  } catch (err) {
    // The project document already exists at this point — don't fail
    // the whole creation over a non-critical activity-log write.
    console.error("[projectService.createProject] activity log write failed (project was still created):", err);
  }

  try {
    // Best-effort: gives the project a real stage to upload into
    // immediately, without forcing the user through "Create Stage"
    // first. Not fatal if this fails — uploadProjectFile falls back
    // to the same getOrCreateDefaultStage() call the first time
    // someone actually uploads, so no asset can ever end up with a
    // null stageId either way.
    await getOrCreateDefaultStage(workspaceId, projectId, owner);
  } catch (err) {
    console.error("[projectService.createProject] default-stage creation failed (project was still created):", err);
  }

  return projectId;
}

/**
 * Fetches ALL projects for a workspace (client applies search/
 * filter/sort/pagination on top — see useProjects.ts). Workspace
 * project counts are expected to stay in the hundreds for a
 * creative-team SaaS, so this is simpler and cheaper than wiring up
 * composite Firestore indexes for every filter combination; revisit
 * with server-side pagination if a workspace's project count grows
 * large.
 */
export async function getWorkspaceProjects(workspaceId: string): Promise<Project[]> {
  const q = query(projectsCol(), where("workspaceId", "==", workspaceId), orderBy("updatedAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getProject(workspaceId: string, projectId: string): Promise<Project | null> {
  const snapshot = await getDoc(projectDoc(projectId));
  if (!snapshot.exists()) return null;
  const project = snapshot.data();
  // Defense in depth: never return a project belonging to a different workspace,
  // even if called with a stale/mismatched id.
  if (project.workspaceId !== workspaceId) return null;
  return project;
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  patch: UpdateProjectPayload
): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");

  await updateDoc(projectDoc(projectId), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as never);
}

/** Best-effort — see /api/workspaces/resync-count's doc comment for why this is an absolute resync, not a decrement, and why it's safe to fire-and-forget. */
async function resyncProjectCount(workspaceId: string): Promise<void> {
  try {
    await callProjectApi("/api/workspaces/resync-count", { workspaceId, metric: "project" });
  } catch (err) {
    console.error("[projectService] project-count resync failed (non-fatal):", err);
  }
}

export async function archiveProject(workspaceId: string, projectId: string): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  await updateDoc(projectDoc(projectId), {
    isArchived: true,
    archivedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
  // Archiving frees a slot — resync so the next creation/restore check
  // sees accurate capacity. Fire-and-forget: the archive itself already
  // succeeded above regardless of whether this does.
  void resyncProjectCount(workspaceId);
}

/**
 * Restoring an archived project INCREASES the active count, so unlike
 * archive/delete it must be checked against maxProjects — the same
 * threat class as creation. firestore.rules' `projects` update rule
 * now specifically denies a client-direct true->false `isArchived`
 * transition, so this goes through /api/projects/restore instead of a
 * plain updateDoc — see that route's doc comment.
 */
export async function restoreProject(workspaceId: string, projectId: string): Promise<void> {
  await callProjectApi("/api/projects/restore", { workspaceId, projectId });
}

export async function deleteProject(workspaceId: string, projectId: string): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");

  if (existing.coverImageUrl) {
    try {
      const fileName = decodeURIComponent(existing.coverImageUrl.split("/").pop()?.split("?")[0] ?? "");
      if (fileName) await deleteFile(projectCoverRef(workspaceId, projectId, fileName.split("cover-").pop() ?? fileName));
    } catch {
      // Best-effort cleanup — don't block project deletion on storage cleanup failing.
    }
  }

  const wasActive = !existing.isArchived;
  await deleteDoc(projectDoc(projectId));
  // Only resync if the deleted project was actually counted (active,
  // not already archived) — avoids an unnecessary aggregate query on
  // the common "delete an already-archived project" path.
  if (wasActive) void resyncProjectCount(workspaceId);
}

export async function duplicateProject(
  workspaceId: string,
  projectId: string,
  requestedBy: ProjectMember
): Promise<string> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");

  // Same quota-gated server route as createProject — a duplicate is
  // still a NEW active project counting against maxProjects, so it
  // can't bypass the check just by going through a different client
  // function that used to write straight to Firestore.
  const { projectId: newProjectId } = await callProjectApi<{ projectId: string }>("/api/projects/create", {
    workspaceId,
    name: `${existing.name} (Copy)`,
    description: existing.description,
    color: existing.color,
    icon: existing.icon,
    statusId: existing.statusId,
    priorityId: existing.priorityId,
    startDate: existing.startDate,
    dueDate: existing.dueDate,
    tags: existing.tags,
    ownerDisplayName: requestedBy.displayName,
    ownerPhotoURL: requestedBy.photoURL,
    ownerEmail: requestedBy.email,
  });

  try {
    await upsertProjectMembership({ projectId: newProjectId, workspaceId, uid: requestedBy.uid, role: "owner", addedBy: requestedBy.uid });
  } catch (err) {
    console.error("[projectService.duplicateProject] owner project_members write failed (project was still created):", err);
  }

  if (existing.coverImageUrl) {
    try {
      await updateDoc(projectDoc(newProjectId), { coverImageUrl: existing.coverImageUrl, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error("[projectService.duplicateProject] cover image copy failed (project was still created):", err);
    }
  }

  return newProjectId;
}

export async function toggleFavorite(workspaceId: string, projectId: string, uid: string, isFavorited: boolean): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  await updateDoc(projectDoc(projectId), {
    favoritedBy: isFavorited ? arrayRemove(uid) : arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function togglePinned(workspaceId: string, projectId: string, uid: string, isPinned: boolean): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  await updateDoc(projectDoc(projectId), {
    pinnedBy: isPinned ? arrayRemove(uid) : arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function addProjectMember(workspaceId: string, projectId: string, member: ProjectMember, addedBy: string): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  if (existing.members.some((m) => m.uid === member.uid)) return;
  await updateDoc(projectDoc(projectId), {
    members: arrayUnion(member),
    updatedAt: serverTimestamp(),
  });
  // Real access-control record — see upsertProjectMembership's doc
  // comment. Without this, the array write above updates DISPLAY
  // data only; the new member still couldn't see the project at all
  // under the membership-filtered visibility model.
  await upsertProjectMembership({ projectId, workspaceId, uid: member.uid, role: member.role, addedBy });
}

export async function removeProjectMember(workspaceId: string, projectId: string, member: ProjectMember): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  await updateDoc(projectDoc(projectId), {
    members: arrayRemove(member),
    updatedAt: serverTimestamp(),
  });
  // Deleting the access-control record is what actually revokes
  // visibility (Scenario E: removed member loses access immediately)
  // — removing from the display array alone would not.
  await deleteDoc(projectMemberDoc(projectId, member.uid));
}

export async function updateProjectMemberRole(
  workspaceId: string,
  projectId: string,
  uid: string,
  role: ProjectMember["role"]
): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  const nextMembers = existing.members.map((m) => (m.uid === uid ? { ...m, role } : m));
  await updateDoc(projectDoc(projectId), {
    members: nextMembers,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(projectMemberDoc(projectId, uid), { role, updatedAt: serverTimestamp() } as never);
}

/** Every project a UID has explicit access to within one workspace — the source query for the membership-filtered project list (see useProjects.ts). Never fetches project DOCUMENTS themselves; callers fetch only the ones this returns. */
export async function getMyProjectIds(workspaceId: string, uid: string): Promise<string[]> {
  const q = query(projectMembersCol(), where("workspaceId", "==", workspaceId), where("uid", "==", uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data().projectId);
}

/** A single UID's membership record for one project, or null if they have none — used by the project-detail authorization gate (see ProjectDetailsContext.tsx). */
export async function getProjectMembership(projectId: string, uid: string): Promise<ProjectMembership | null> {
  const snapshot = await getDoc(projectMemberDoc(projectId, uid));
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * ONE-TIME, PURELY ADDITIVE migration for the project-level access
 * model: backfills a real `project_members` record for every entry
 * already present in each existing project's denormalized
 * `Project.members[]` array — the safest possible source of truth for
 * "who was already intended to have access to this project", since
 * every project's array has always included at least its owner (set
 * at creation, see createProject above) and anyone explicitly invited
 * via the existing Project Members tab.
 *
 * Deliberately does NOT delete, overwrite, or reinterpret anything:
 * - Never touches `Project.members[]` itself.
 * - Skips any (projectId, uid) pair that already has a project_members
 *   doc (idempotent — safe to call repeatedly, e.g. on every Projects
 *   page load by a workspace owner/admin, without duplicating writes
 *   or clobbering an already-correct record).
 * - Never removes access from anyone; a project with an EMPTY
 *   members[] array (shouldn't happen given createProject's
 *   invariant, but handled defensively) simply gets no backfilled
 *   records — its owner (ownerId) is backfilled explicitly below as
 *   an extra safety net so no project is ever left with zero access
 *   for its rightful owner.
 *
 * Requires the caller to already be authorized to write project_members
 * for this workspace (workspace owner/admin or Super Admin — see
 * firestore.rules' canManageProject) — called from useProjects.ts only
 * when that's already true, once per workspace per app session.
 */
export async function backfillProjectMemberships(workspaceId: string, actorUid: string): Promise<void> {
  const projects = await getWorkspaceProjects(workspaceId);

  for (const project of projects) {
    const membersToBackfill = project.members.length > 0
      ? project.members.map((m) => ({ uid: m.uid, role: m.role }))
      : [{ uid: project.ownerId, role: "owner" as ProjectMember["role"] }];

    for (const { uid, role } of membersToBackfill) {
      if (!uid) continue;
      try {
        const existing = await getDoc(projectMemberDoc(project.id, uid));
        if (existing.exists()) continue; // idempotent — never overwrite an already-migrated or already-current record
        await setDoc(projectMemberDoc(project.id, uid), {
          id: `${project.id}_${uid}`,
          projectId: project.id,
          workspaceId,
          uid,
          role,
          permissions: [],
          addedBy: actorUid,
          addedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as never);
      } catch (err) {
        // Best-effort per-record: one bad/legacy member entry must
        // never abort backfilling the rest of the workspace's projects.
        console.error(`[projectService.backfillProjectMemberships] failed for project ${project.id}, uid ${uid}:`, err);
      }
    }
  }
}

export async function getRecentProjects(workspaceId: string, take = 5): Promise<Project[]> {
  const q = query(
    projectsCol(),
    where("workspaceId", "==", workspaceId),
    where("isArchived", "==", false),
    orderBy("updatedAt", "desc"),
    fbLimit(take)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}
