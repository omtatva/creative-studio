import { ID, Timestamps } from "./common.types";
import { WorkspacePlan, WorkspacePlanLimits } from "./workspace.types";

/**
 * The full subscription lifecycle a real billing provider (Stripe,
 * Razorpay, Paddle, ...) reports via webhook — see billingService.ts.
 * `workspace.subscriptionStatus` (the fast-path field every EXISTING
 * limit check already reads) stays a narrower cache of this; this is
 * the detailed, provider-facing record.
 */
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "paused";

/**
 * The lifecycle of a SPECIFIC checkout attempt — deliberately separate
 * from `SubscriptionStatus` (what the customer is currently entitled
 * to) and `PaymentStatus` (whether money has actually moved). A
 * subscription can sit at `status: "trialing"` with
 * `checkoutStatus: "created"` at the same time — one checkout attempt
 * resolving (completed/cancelled/failed) never by itself implies the
 * subscription's own status changed; only a verified `paymentStatus:
 * "paid"` does that (see billingAdmin.ts/webhook route).
 */
export type CheckoutStatus = "not_started" | "created" | "redirected" | "completed" | "cancelled" | "failed";

/** Whether money has actually moved for the current/last checkout attempt — the ONLY thing that may ever flip a subscription to a genuinely paid `active` status. Never inferred from `status` or `checkoutStatus` alone. */
export type PaymentStatus = "not_started" | "pending" | "paid" | "failed" | "cancelled" | "refunded";

/**
 * "manual" means no real payment provider is connected yet — a plan
 * became active because an Omtatva admin (Super Admin) activated it
 * directly (see Enterprise sales-lead activation, or a Free/Pro/Business
 * plan change approved before a real processor is wired up). Once a
 * provider is connected, new subscriptions use its id instead — nothing
 * else in the app needs to change, since every read goes through
 * subscriptionService.ts / billingService.ts, never a hardcoded string.
 */
export type BillingProvider = "manual" | "stripe" | "razorpay" | "paddle";

/**
 * workspaces/{workspaceId}/billing/subscription — the SOURCE OF TRUTH
 * for what a workspace is entitled to. Deliberately a separate doc
 * from `workspaces/{id}` itself (which keeps its existing `plan`/
 * `limits`/`subscriptionStatus`/`pendingPlan` fields as a synced,
 * read-fast CACHE every existing limit check already reads — see
 * subscriptionService.ts's syncWorkspaceCache) rather than replacing
 * those fields, so no existing call site needs to change.
 *
 * Firestore rules make this doc admin-SDK-write-only (see
 * firestore.rules' `billing` match block) — no client, including the
 * workspace owner's own browser, may ever write here directly. Every
 * write goes through a server route (checkout/webhook/manual-activate)
 * that independently verifies who's asking and what they're allowed to
 * do — see billingService.ts's doc comment for why.
 */
export interface WorkspaceSubscription extends Timestamps {
  workspaceId: ID;
  planId: WorkspacePlan;
  status: SubscriptionStatus;
  billingProvider: BillingProvider;
  /** Provider-side customer id (e.g. Stripe Customer id) — null until a real provider is connected. */
  customerId: string | null;
  /** Provider-side subscription id — null for "manual" activations. */
  subscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialStart: string | null;
  trialEnd: string | null;
  /**
   * Enterprise (and only Enterprise, by convention — see
   * subscriptionService.ts's resolveEntitlements) supports a per-workspace
   * override instead of one fixed number per plan, since two Enterprise
   * customers can have completely different negotiated limits. A
   * partial patch over PLAN_LIMITS[planId] — set a key here to override
   * just that one limit; everything else still comes from the plan.
   */
  customEntitlements: Partial<WorkspacePlanLimits> | null;
  /** uid of whoever last changed this record (an owner requesting a plan, or the Super Admin account activating one) — audit trail, not read for access control. */
  updatedBy: ID | null;
  /**
   * The provider event timestamp (ISO string) of the last WEBHOOK
   * event actually applied to this subscription — null until the
   * first webhook event lands (manual/Super-Admin actions never set
   * this). Used ONLY for out-of-order protection (see
   * applySubscriptionUpdateIdempotent in billingAdmin.ts): a later-
   * arriving webhook event whose OWN timestamp is older than this is
   * rejected rather than overwriting newer state with stale data.
   */
  lastEventTimestamp: string | null;
  /**
   * A plan the owner picked while a DIFFERENT plan is still genuinely
   * entitled (an active paid plan, or a trial that hasn't expired yet)
   * — see /api/billing/change-plan's doc comment. Deliberately NOT the
   * same thing as `status: "incomplete"` + `planId`: that combination
   * means "no live entitlement to protect, fall back to free limits
   * until paid," which is correct for a brand-new/lapsed/expired
   * subscription but WRONG for someone mid-trial or already paying —
   * this field lets a request be recorded and shown to Super Admin
   * without touching `status`/`planId`/`trialEnd` at all, so the
   * caller's CURRENT entitlement keeps applying, uninterrupted, until
   * a real activation (webhook or Super Admin) clears this and sets
   * the new plan for real. Null when there's no pending request.
   */
  requestedPlanId: WorkspacePlan | null;
  /**
   * Explicit evidence that THIS activation was a manual/complimentary
   * one by Super Admin (see activatePlanManually) — written ONLY by that
   * path. It is what lets Super Admin call an active subscription
   * "Complimentary / Manual" rather than guess: an active subscription
   * with neither this marker nor `paymentStatus: "paid"` (every record
   * activated before this field existed, or by a provider event that
   * reported no payment outcome) is "Legacy / Payment status unknown" —
   * historical payment information is never fabricated, and existing
   * records are never backfilled to make the display tidier. Absent on
   * all legacy records.
   */
  activationSource?: "manual";
  /** See CheckoutStatus's doc comment. "not_started" until the owner actually initiates a checkout/change-plan request. */
  checkoutStatus: CheckoutStatus;
  /** See PaymentStatus's doc comment. "not_started" until a checkout exists; only a webhook-verified event may ever set "paid". */
  paymentStatus: PaymentStatus;
}

export type SalesLeadStatus = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";

/**
 * sales_leads/{leadId} — an Enterprise "Contact Sales" submission.
 * Firestore rules deny ALL direct client access (create AND read) —
 * see firestore.rules. Creation goes through POST /api/sales-leads
 * (public, no auth required — matches a normal marketing contact
 * form), which uses firebase-admin to write regardless of whether the
 * visitor is signed in. Reading/updating is Super-Admin-only, done from
 * the internal Settings > Sales Leads page via the SAME isSuperAdmin()
 * check every other cross-workspace admin view in this app already
 * uses (see itSupport.ts) — no new admin/auth concept introduced.
 */
export interface SalesLead extends Timestamps {
  id: ID;
  name: string;
  companyName: string;
  email: string;
  phone: string | null;
  teamSize: string | null;
  currentWorkflow: string | null;
  lookingFor: string | null;
  message: string | null;
  expectedProjects: string | null;
  storageRequirements: string | null;
  aiRequirements: string | null;
  integrationsNeeded: string | null;
  timeline: string | null;
  status: SalesLeadStatus;
  /** Set once an owner is already signed in when they submit (e.g. from inside Settings > Billing) — null for an anonymous marketing-site submission. Never trusted for authorization, only to pre-fill "which workspace is this about" when activating. */
  workspaceId: ID | null;
  /** Set only after a "Mark Won" → "Create/Activate Enterprise Subscription" action — see /api/billing/activate-enterprise. */
  activatedWorkspaceId: ID | null;
}
