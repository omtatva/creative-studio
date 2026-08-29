import { ID, Timestamps } from "./common.types";

/**
 * Multi-tenant root object. Every piece of workspace-scoped data
 * (members, settings, files, notifications, and later projects/tasks)
 * is stored under a path keyed by workspaceId so tenants never
 * collide. See src/lib/firebase/firestore.ts for the collection map.
 */
export type WorkspacePlan = "starter" | "pro" | "business" | "enterprise";

/**
 * "starter" is the internal id for the plan every workspace defaults
 * to (see DEFAULT_PLAN in planLimits.ts) — kept as-is for backward
 * compatibility with every workspace already created, but shown to
 * users as "Free" (see PLAN_DISPLAY_NAMES). Renaming the id itself
 * would silently break plan lookups for every existing workspace.
 */

/**
 * Per-plan feature limits — modeled now so a future billing/upgrade
 * flow has real data to enforce against, without building that flow
 * yet (see lib/constants/planLimits.ts for the actual per-plan
 * numbers and DEFAULT_PLAN). Nothing currently reads these to block
 * an action; they're seeded on every workspace at creation so the
 * enforcement layer can be added later without a data migration.
 */
export interface WorkspacePlanLimits {
  maxMembers: number;
  maxProjects: number;
  maxStorageBytes: number;
  maxAIRequestsPerMonth: number;
  enabledFeatures: string[];
}

export interface Workspace extends Timestamps {
  id: ID;
  name: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  slug: string;
  ownerId: ID;
  plan: WorkspacePlan;
  limits: WorkspacePlanLimits;
  /**
   * A fast-path CACHE of workspaces/{id}/billing/subscription's own
   * `status` (see WorkspaceSubscription in billing.types.ts, the real
   * source of truth) — kept in sync by subscriptionService.ts's
   * syncWorkspaceCache so every EXISTING call site that already reads
   * `workspace.subscriptionStatus`/`workspace.plan`/`workspace.limits`
   * (checkWorkspaceLimit, canUseFeature, ...) keeps working unchanged;
   * none of them need to learn about the subscription doc at all.
   * "pending_payment" is this cache's own extra state (not a real
   * SubscriptionStatus value) for "requested a paid plan, no
   * subscription doc confirming it yet" — plan/limits stay on the free
   * tier the whole time. See createWorkspace() in workspaceService.ts.
   */
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "paused" | "pending_payment";
  /** The plan the user picked but hasn't paid for yet; null once active. */
  pendingPlan: WorkspacePlan | null;
  timezone: string;
  defaultLanguage: string;
}

export type MemberRole = "owner" | "admin" | "member" | "viewer";

/**
 * Join record between a user and a workspace. A user has one
 * `AppUser` document globally but one `Member` document per
 * workspace they belong to (members/{workspaceId}_{uid}).
 */
export interface Member extends Timestamps {
  id: ID; // `${workspaceId}_${uid}`
  workspaceId: ID;
  userId: ID;
  role: MemberRole;
  email: string;
  displayName: string;
  photoURL: string | null;
  status: "active" | "invited" | "suspended";
  /** Set when this membership was created by accepting a WorkspaceInvite — traceability only, not read for access control. */
  sourceInviteId?: ID | null;
}

export interface CreateWorkspacePayload {
  name: string;
  companyName: string;
  slug: string;
  companyEmail: string | null;
  companyWebsite: string | null;
  timezone: string;
  defaultLanguage: string;
  companyLogoFile: File | null;
  /** The plan picked on /pricing before signup, if any. Omitted/starter = free, immediately active. Paid plans start pending — see createWorkspace(). */
  plan?: WorkspacePlan;
}

/**
 * A pending invitation to join the workspace. Kept as its own
 * collection rather than a `Member` doc with status "invited" —
 * `Member`'s id is `${workspaceId}_${uid}` and requires a real
 * Firebase Auth uid, which doesn't exist until the invitee signs
 * up. Actual email delivery needs a backend function this codebase
 * doesn't include; this collection is the real, working data layer
 * (create/list/cancel) an email-sending step would plug into.
 */
export interface WorkspaceInvite extends Timestamps {
  id: ID;
  workspaceId: ID;
  /** Denormalized at creation time so the invite landing page can show it before the invitee is a member (and thus can't read the workspace doc). */
  workspaceName: string;
  email: string;
  role: MemberRole;
  invitedBy: ID;
  invitedByName: string;
  status: "pending" | "accepted" | "cancelled";
  expiresAt: string;
  acceptedAt?: string | null;
}

/**
 * A workspace-defined custom role: a name plus a set of permission
 * keys from PERMISSION_CATALOG (see lib/constants/permissions.ts).
 * Distinct from `MemberRole`, which stays a fixed system-role union
 * used for actual access control everywhere else in the app —
 * CustomRole is a management/reference layer for future use, not a
 * drop-in replacement for `Member.role`.
 */
export interface CustomRole extends Timestamps {
  id: ID;
  workspaceId: ID;
  name: string;
  description: string;
  permissions: string[];
  isSystemRole: boolean;
  isArchived: boolean;
}

/**
 * Lightweight, minimal-data slug registry — deliberately NOT the
 * full `workspaces` collection. Checking slug availability needs to
 * work for a brand-new authenticated user who isn't a member of any
 * workspace yet, but `workspaces` reads are (correctly) restricted
 * to members of that specific workspace. Querying `workspaces` by
 * slug for a non-member is what caused the permission-denied on
 * every single workspace creation attempt — Firestore rejects a
 * `where()` query outright when it can't statically verify every
 * possible result satisfies the read rule, regardless of whether
 * the query would have matched zero documents. This collection
 * exists purely to make that existence check safe: its document ID
 * IS the slug, so checking availability is a single-document read
 * anyone signed in can make, and it holds nothing beyond the three
 * fields needed for uniqueness — never company data, members, or
 * settings.
 */
export interface WorkspaceSlug {
  slug: string;
  workspaceId: ID;
  createdAt: string;
}
