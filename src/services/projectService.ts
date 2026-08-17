import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
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
import { projectsCol, projectDoc } from "@/lib/firebase/firestore";
import { deleteFile, projectCoverRef, uploadFile } from "@/lib/firebase/storage";
import { logActivity } from "@/services/activityService";
import { getOrCreateDefaultStage } from "@/services/stageService";
import {
  CreateProjectPayload,
  Project,
  ProjectMember,
  UpdateProjectPayload,
} from "@/types/project.types";

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
  const projectRef = doc(projectsCol());
  const projectId = projectRef.id;

  // STEP 5: isolate the Storage upload from the Firestore write — if
  // this throws, the error is attributable to the cover image upload,
  // not the project document itself, and we never reach setDoc().
  let coverImageUrl: string | null = null;
  if (payload.coverImageFile) {
    try {
      const coverRef = projectCoverRef(workspaceId, projectId, payload.coverImageFile.name);
      coverImageUrl = await uploadFile(coverRef, payload.coverImageFile);
    } catch (err) {
      console.error("[projectService.createProject] cover image upload failed:", err);
      throw new Error(
        `Cover image upload failed: ${(err as { message?: string })?.message ?? "unknown storage error"}`
      );
    }
  }

  const project: Omit<Project, "createdAt" | "updatedAt"> = {
    id: projectId,
    workspaceId,
    name: payload.name,
    description: payload.description,
    coverImageUrl,
    color: payload.color,
    icon: payload.icon,
    statusId: payload.statusId,
    priorityId: payload.priorityId,
    startDate: payload.startDate,
    dueDate: payload.dueDate,
    ownerId: owner.uid,
    members: [owner],
    tags: payload.tags,
    progress: 0,
    isArchived: false,
    archivedAt: null,
    favoritedBy: [],
    pinnedBy: [],
    createdBy: owner.uid,
  };

  // STEP 6: Firestore rejects `undefined` field values outright — strip
  // any that slipped through (e.g. an unresolved form field) instead of
  // letting setDoc() throw an opaque "invalid data" error, and log the
  // exact payload being written so a bad value is visible immediately.
  const sanitizedProject = Object.fromEntries(
    Object.entries(project).filter(([, value]) => value !== undefined)
  ) as Omit<Project, "createdAt" | "updatedAt">;
  const droppedFields = Object.keys(project).filter((key) => (project as Record<string, unknown>)[key] === undefined);
  if (droppedFields.length > 0) {
    console.warn("[projectService.createProject] dropped undefined fields before write:", droppedFields);
  }

  console.log("[projectService.createProject] writing to path:", projectRef.path);
  console.log("[projectService.createProject] payload:", sanitizedProject);
  console.log("[projectService.createProject] workspaceId:", workspaceId, "ownerId:", owner.uid);

  try {
    await setDoc(projectRef, {
      ...sanitizedProject,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    const firebaseErr = err as { code?: string; message?: string; stack?: string };
    console.error("[projectService.createProject] Firestore write FAILED:", err);
    console.error("[projectService.createProject] error.code:", firebaseErr?.code);
    console.error("[projectService.createProject] error.message:", firebaseErr?.message);
    console.error("[projectService.createProject] error.stack:", firebaseErr?.stack);
    throw err;
  }

  console.log("[projectService.createProject] Firestore write SUCCEEDED:", projectId);

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

export async function archiveProject(workspaceId: string, projectId: string): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  await updateDoc(projectDoc(projectId), {
    isArchived: true,
    archivedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

export async function restoreProject(workspaceId: string, projectId: string): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  await updateDoc(projectDoc(projectId), {
    isArchived: false,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });
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

  await deleteDoc(projectDoc(projectId));
}

export async function duplicateProject(
  workspaceId: string,
  projectId: string,
  requestedBy: ProjectMember
): Promise<string> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");

  const newRef = doc(projectsCol());

  const duplicate: Omit<Project, "createdAt" | "updatedAt"> = {
    ...existing,
    id: newRef.id,
    name: `${existing.name} (Copy)`,
    isArchived: false,
    archivedAt: null,
    favoritedBy: [],
    pinnedBy: [],
    progress: 0,
    ownerId: requestedBy.uid,
    members: [requestedBy],
    createdBy: requestedBy.uid,
  };

  await setDoc(newRef, {
    ...duplicate,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newRef.id;
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

export async function addProjectMember(workspaceId: string, projectId: string, member: ProjectMember): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  if (existing.members.some((m) => m.uid === member.uid)) return;
  await updateDoc(projectDoc(projectId), {
    members: arrayUnion(member),
    updatedAt: serverTimestamp(),
  });
}

export async function removeProjectMember(workspaceId: string, projectId: string, member: ProjectMember): Promise<void> {
  const existing = await getProject(workspaceId, projectId);
  if (!existing) throw new Error("Project not found in this workspace.");
  await updateDoc(projectDoc(projectId), {
    members: arrayRemove(member),
    updatedAt: serverTimestamp(),
  });
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
