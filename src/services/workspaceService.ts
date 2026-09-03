import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { workspacesCol, workspaceDoc, workspaceSlugDoc, memberDoc, userDoc, settingsDoc, membersCol } from "@/lib/firebase/firestore";
import { uploadFile, workspaceLogoRef } from "@/lib/firebase/storage";
import { getCurrentUser } from "@/lib/firebase/auth";
import { CreateWorkspacePayload, Workspace } from "@/types/workspace.types";
import { DEFAULT_THEME } from "@/types/theme.types";
import { DEFAULT_PROJECT_OPTIONS } from "@/lib/constants/projectOptions";
import { DEFAULT_TASK_OPTIONS } from "@/lib/constants/taskOptions";
import { DEFAULT_ASSET_OPTIONS } from "@/lib/constants/assetOptions";
import { DEFAULT_PLAN, PLAN_LIMITS } from "@/lib/constants/planLimits";
import {
  DEFAULT_BRANDING_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_SECURITY_SETTINGS,
  DEFAULT_STORAGE_SETTINGS,
  DEFAULT_PROJECT_DEFAULT_SETTINGS,
  DEFAULT_TASK_DEFAULT_SETTINGS,
  DEFAULT_REVIEW_DEFAULT_SETTINGS,
  DEFAULT_SIDEBAR_CONFIG,
  DEFAULT_FIELD_SECURITY_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_WHITE_LABEL_SETTINGS,
} from "@/lib/constants/settingsDefaults";

/**
 * Owns the multi-tenant "create workspace" flow: reserves the slug,
 * creates the workspace doc, the owner's `members` doc, a default
 * `settings` doc, and flips the creating user's `activeWorkspaceId`.
 * Writes happen sequentially (not in a single runTransaction) so a
 * permission rejection identifies exactly which document failed —
 * Firestore transactions report ALL rule rejections as one generic
 * "Missing or insufficient permissions" with no indication of which
 * of several writes caused it, which made an earlier rules bug here
 * very hard to pin down. If any step fails, every prior successful
 * write in the same call is rolled back before re-throwing, so a
 * rejected creation still can't leave an orphaned partial tenant —
 * see createWorkspace's attemptWrite/rollback below.
 */

/**
 * Checks `workspace_slugs/{slug}` — a single-document read anyone
 * signed in can make — instead of querying the protected
 * `workspaces` collection by slug. That query was the actual root
 * cause of every "permission-denied" on workspace creation: a
 * brand-new user isn't a member of any workspace yet, so the
 * `workspaces` read rule rejected the query outright (Firestore
 * rejects a `where()` query whenever it can't statically prove every
 * possible result satisfies the rule, regardless of whether the
 * query would have matched anything) — and this happened BEFORE
 * createWorkspace() was ever called, which is why no amount of
 * fixing createWorkspace()'s own writes ever showed a different
 * error. See WorkspaceSlug's doc comment in workspace.types.ts.
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const currentUser = getCurrentUser();
  console.log("[workspaceService.isSlugAvailable] reading workspace_slugs/" + slug, {
    operation: "getDoc",
    path: `workspace_slugs/${slug}`,
    slug,
    authCurrentUserExists: currentUser !== null,
    authCurrentUserUid: currentUser?.uid ?? null,
  });
  try {
    const snapshot = await getDoc(workspaceSlugDoc(slug));
    console.log("[workspaceService.isSlugAvailable] read OK, exists:", snapshot.exists());
    return !snapshot.exists();
  } catch (err) {
    const firebaseErr = err as { code?: string; message?: string; stack?: string };
    console.error("[workspaceService.isSlugAvailable] FAILED reading workspace_slugs/" + slug, err);
    console.error("[workspaceService.isSlugAvailable] error.code:", firebaseErr?.code);
    console.error("[workspaceService.isSlugAvailable] error.message:", firebaseErr?.message);
    console.error("[workspaceService.isSlugAvailable] error.stack:", firebaseErr?.stack);
    throw err;
  }
}

export async function createWorkspace(
  ownerId: string,
  ownerEmail: string,
  ownerDisplayName: string,
  ownerPhotoURL: string | null,
  payload: CreateWorkspacePayload
): Promise<string> {
  const workspaceRef = doc(workspacesCol());
  const workspaceId = workspaceRef.id;

  // Deliberately NOT uploaded yet — storage.rules' branding write rule
  // requires real workspace membership (isWorkspaceAdmin), which can't
  // exist before the workspaces/{id} and members/{id}_{ownerId} docs
  // below are actually committed. Upload happens further down, right
  // after the owner's membership doc succeeds; this starts as null and
  // gets patched onto the already-created workspace doc afterward
  // (settings/{id}, created after that point, picks up the real value
  // directly — see below).
  let companyLogoUrl: string | null = null;

  /**
   * Firestore transactions report a permission rejection as ONE
   * generic "Missing or insufficient permissions" error — they never
   * say which of the transaction's several writes was actually
   * rejected. That ambiguity is exactly what's blocked diagnosing
   * this: the settings-doc rule was fixed, but there was no way to
   * confirm whether that fix was actually deployed, or whether a
   * completely different write in the same transaction was the real
   * culprit. Writing sequentially with a try/catch around each step
   * makes the failing document's exact path and error visible
   * immediately. If any step fails, everything written so far in
   * this same call is deleted before re-throwing, so a rejected
   * creation still can't leave an orphaned partial tenant behind —
   * approximating the transaction's atomicity guarantee.
   */
  const completedWrites: (() => Promise<void>)[] = [];
  const currentUser = getCurrentUser();

  async function attemptWrite(label: string, fn: () => Promise<void>, rollback: () => Promise<void>) {
    // DIAGNOSTIC (per your checklist): operation name, collection/path
    // (via `label`), authenticated UID, workspaceId, slug, and whether
    // auth.currentUser exists — logged immediately before every write.
    console.log(`[workspaceService.createWorkspace] writing ${label}...`, {
      operation: "setDoc",
      path: label,
      workspaceId,
      slug: payload.slug,
      ownerId,
      authCurrentUserExists: currentUser !== null,
      authCurrentUserUid: currentUser?.uid ?? null,
    });
    try {
      await fn();
      console.log(`[workspaceService.createWorkspace] wrote ${label} OK`);
      completedWrites.push(rollback);
    } catch (err) {
      const firebaseErr = err as { code?: string; message?: string; stack?: string };
      console.error(`[workspaceService.createWorkspace] FAILED writing ${label}:`, err);
      console.error("[workspaceService.createWorkspace] error.code:", firebaseErr?.code);
      console.error("[workspaceService.createWorkspace] error.message:", firebaseErr?.message);
      console.error("[workspaceService.createWorkspace] error.stack:", firebaseErr?.stack);

      // Roll back everything that succeeded before this failure.
      for (const undo of completedWrites.reverse()) {
        try {
          await undo();
        } catch (rollbackErr) {
          console.error("[workspaceService.createWorkspace] rollback step failed (continuing):", rollbackErr);
        }
      }
      throw err;
    }
  }

  await attemptWrite(
    `workspace_slugs/${payload.slug}`,
    () =>
      setDoc(workspaceSlugDoc(payload.slug), {
        slug: payload.slug,
        workspaceId,
        createdAt: serverTimestamp(),
      }),
    () => deleteDoc(workspaceSlugDoc(payload.slug))
  );

  /**
   * A paid plan picked on /pricing doesn't activate just because the
   * user got this far — the workspace is created on the free plan's
   * real limits, with the requested plan parked in `pendingPlan` and
   * `subscriptionStatus: "pending_payment"`. A future Stripe webhook
   * is what flips plan/limits to the paid tier and subscriptionStatus
   * to "active"; nothing here charges anyone or grants paid limits.
   */
  const requestedPlan = payload.plan ?? DEFAULT_PLAN;
  const isPaidPlanRequest = requestedPlan !== DEFAULT_PLAN;

  await attemptWrite(
    `workspaces/${workspaceId}`,
    () =>
      setDoc(workspaceRef, {
        id: workspaceId,
        name: payload.name,
        companyName: payload.companyName,
        companyLogoUrl,
        companyEmail: payload.companyEmail || null,
        companyWebsite: payload.companyWebsite || null,
        slug: payload.slug,
        ownerId,
        plan: DEFAULT_PLAN,
        limits: PLAN_LIMITS[DEFAULT_PLAN],
        subscriptionStatus: isPaidPlanRequest ? "pending_payment" : "active",
        pendingPlan: isPaidPlanRequest ? requestedPlan : null,
        timezone: payload.timezone,
        defaultLanguage: payload.defaultLanguage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as never),
    () => deleteDoc(workspaceRef)
  );

  const memberRef = memberDoc(workspaceId, ownerId);
  await attemptWrite(
    `members/${workspaceId}_${ownerId}`,
    () =>
      setDoc(memberRef, {
        id: `${workspaceId}_${ownerId}`,
        workspaceId,
        userId: ownerId,
        role: "owner",
        email: ownerEmail,
        displayName: ownerDisplayName,
        photoURL: ownerPhotoURL,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as never),
    () => deleteDoc(memberRef)
  );

  // NOW authorized to upload branding (the owner's membership doc
  // above just committed) — best-effort, deliberately NOT wrapped in
  // attemptWrite's rollback: a logo that fails to upload should never
  // undo an otherwise-successful workspace creation. The owner can
  // just add it later from Settings > Workspace.
  if (payload.companyLogoFile) {
    try {
      const logoRef = workspaceLogoRef(workspaceId, payload.companyLogoFile.name);
      companyLogoUrl = await uploadFile(logoRef, payload.companyLogoFile);
      await updateDoc(workspaceRef, { companyLogoUrl, updatedAt: serverTimestamp() } as never);
    } catch (err) {
      console.error("[workspaceService.createWorkspace] logo upload failed (workspace still created):", err);
    }
  }

  const settingsRef = settingsDoc(workspaceId);
  await attemptWrite(
    `settings/${workspaceId}`,
    () =>
      setDoc(settingsRef, {
        workspaceId,
        theme: DEFAULT_THEME,
        branding: { ...DEFAULT_BRANDING_SETTINGS, logoUrl: companyLogoUrl },
        notifications: DEFAULT_NOTIFICATION_SETTINGS,
        security: DEFAULT_SECURITY_SETTINGS,
        storage: DEFAULT_STORAGE_SETTINGS,
        projectDefaults: DEFAULT_PROJECT_DEFAULT_SETTINGS,
        taskDefaults: DEFAULT_TASK_DEFAULT_SETTINGS,
        reviewDefaults: DEFAULT_REVIEW_DEFAULT_SETTINGS,
        sidebarConfig: DEFAULT_SIDEBAR_CONFIG,
        fieldSecurity: DEFAULT_FIELD_SECURITY_SETTINGS,
        ai: DEFAULT_AI_SETTINGS,
        whiteLabel: DEFAULT_WHITE_LABEL_SETTINGS,
        projectOptions: DEFAULT_PROJECT_OPTIONS,
        taskOptions: DEFAULT_TASK_OPTIONS,
        assetOptions: DEFAULT_ASSET_OPTIONS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as never),
    () => deleteDoc(settingsRef)
  );

  const previousActiveWorkspaceId = (await getDoc(userDoc(ownerId))).data()?.activeWorkspaceId ?? null;
  await attemptWrite(
    `users/${ownerId} (activeWorkspaceId)`,
    () =>
      // setDoc(..., { merge: true }) instead of updateDoc(): updateDoc
      // throws "not-found" if the target document doesn't exist yet.
      // That's exactly what happened for an account whose Auth user
      // exists but whose users/{uid} Firestore profile doc doesn't
      // (created outside the normal signup flow, or deleted at some
      // point) — merge-set creates it if missing, or merges these
      // fields in if it already exists, either way succeeding.
      setDoc(
        userDoc(ownerId),
        {
          activeWorkspaceId: workspaceId,
          onboardingComplete: true,
          updatedAt: serverTimestamp(),
        } as never,
        { merge: true }
      ),
    () =>
      setDoc(
        userDoc(ownerId),
        { activeWorkspaceId: previousActiveWorkspaceId, updatedAt: serverTimestamp() } as never,
        { merge: true }
      )
  );

  console.log("[workspaceService.createWorkspace] all writes SUCCEEDED:", workspaceId);

  return workspaceId;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const snapshot = await getDoc(workspaceDoc(workspaceId));
  if (!snapshot.exists()) return null;
  return withWorkspaceDefaults(snapshot.data() as Workspace);
}

/**
 * Workspaces created before plan/limits (or subscriptionStatus/
 * pendingPlan) existed have none of those fields in Firestore at
 * all, even though the Workspace type declares them required —
 * Firestore doesn't enforce TS types. Backfilling them here, at the
 * single read path every workspace fetch goes through, means every
 * consumer (planService, Settings, Pricing, etc.) always gets a real
 * object instead of crashing on a missing field for pre-existing
 * workspaces.
 */
function withWorkspaceDefaults(workspace: Workspace): Workspace {
  const plan = workspace.plan ?? DEFAULT_PLAN;
  return {
    ...workspace,
    plan,
    limits: workspace.limits ?? PLAN_LIMITS[plan],
    subscriptionStatus: workspace.subscriptionStatus ?? "active",
    pendingPlan: workspace.pendingPlan ?? null,
  };
}

/** setDoc(..., { merge: true }) rather than updateDoc — see the same reasoning in createWorkspace() above; this keeps switching workspaces safe even if a profile doc is ever missing. */
export async function setActiveWorkspace(uid: string, workspaceId: string): Promise<void> {
  await setDoc(userDoc(uid), { activeWorkspaceId: workspaceId, updatedAt: serverTimestamp() } as never, { merge: true });
}

/**
 * Updates the workspace profile fields the Workspace settings page
 * owns (name/company name/slug/contact info). Logo upload is
 * separate (`updateWorkspaceLogo`) since it needs Storage, not just
 * a Firestore write.
 */
export async function updateWorkspaceProfile(
  workspaceId: string,
  patch: Partial<Pick<Workspace, "name" | "companyName" | "slug" | "companyEmail" | "companyWebsite">>
): Promise<void> {
  await updateDoc(workspaceDoc(workspaceId), { ...patch, updatedAt: serverTimestamp() } as never);
}

export async function updateWorkspaceLogo(workspaceId: string, file: File): Promise<string> {
  const logoRef = workspaceLogoRef(workspaceId, file.name);
  const url = await uploadFile(logoRef, file);
  await updateDoc(workspaceDoc(workspaceId), { companyLogoUrl: url, updatedAt: serverTimestamp() });
  return url;
}

/**
 * Overrides ONE limit on THIS workspace's own `limits` map, independent
 * of its `plan` — see planService.ts: every limit check reads
 * `workspace.limits[key]` (a real per-workspace field, snapshotted from
 * PLAN_LIMITS at creation, see createWorkspace above), never the static
 * PLAN_LIMITS table directly, so writing here takes effect immediately
 * with no plan/billing change needed. `Infinity` is a valid, intentional
 * value — checkWorkspaceLimit already treats `!Number.isFinite(limit)`
 * as "unlimited" (see PLAN_LIMITS.enterprise using the same convention),
 * and Firestore's double type natively supports it.
 */
export async function updateWorkspaceLimit(workspaceId: string, key: keyof Workspace["limits"], value: number): Promise<void> {
  await updateDoc(workspaceDoc(workspaceId), { [`limits.${key}`]: value, updatedAt: serverTimestamp() } as never);
}

/**
 * Deletes a workspace — but deliberately an ACCESS cutoff, not a full
 * data wipe: removes every `members/{workspaceId}_*` doc, the
 * `settings/{workspaceId}` doc, and the `workspaces/{workspaceId}` doc
 * itself. Once these are gone, every access-control function in
 * firestore.rules (isWorkspaceMember, isWorkspaceMemberWithRole,
 * canAccessProject, ...) denies everyone immediately — the workspace
 * disappears from every member's switcher and every project/file/task
 * underneath becomes unreachable. Projects/tasks/files/comments/Storage
 * uploads are intentionally left in place as orphaned, inert data
 * rather than cascaded through and permanently erased — a real full
 * wipe is a separate, much larger and irreversible operation this
 * doesn't attempt.
 *
 * Order matters: members and settings MUST be deleted before the
 * workspace doc itself. Both of their delete rules call
 * isWorkspaceOwner(workspaceId), which does a get() on
 * `workspaces/{workspaceId}` — get() on an already-deleted document
 * throws inside rule evaluation (the same pitfall documented throughout
 * firestore.rules), so deleting the workspace doc first would strand
 * every remaining members/settings doc as undeletable by anyone.
 */
export async function deleteWorkspaceAccess(workspaceId: string): Promise<void> {
  const memberSnapshot = await getDocs(query(membersCol(), where("workspaceId", "==", workspaceId)));
  for (const memberDocSnap of memberSnapshot.docs) {
    await deleteDoc(memberDocSnap.ref);
  }
  await deleteDoc(settingsDoc(workspaceId));
  await deleteDoc(workspaceDoc(workspaceId));
}
