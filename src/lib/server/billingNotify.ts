import "server-only";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { sendGmailMessage, GmailApiError } from "@/lib/server/gmailClient";
import { PLAN_DISPLAY_NAMES, PLAN_PRICING } from "@/lib/constants/planLimits";
import type { WorkspacePlan } from "@/types/workspace.types";

/**
 * Best-effort internal notification for a new checkout/change-plan
 * request — same infrastructure and "send from IT Support's own
 * connected Gmail, log and move on if it fails" pattern as
 * /api/sales-leads' renderLeadEmail/sendGmailMessage call, reused
 * rather than duplicated. The request itself (the subscription doc
 * write) already happened before this is called and is never rolled
 * back if the email fails — this is visibility only, not part of the
 * billing transaction.
 */
export async function notifyPurchaseRequest(params: {
  workspaceId: string;
  workspaceName: string;
  planId: WorkspacePlan;
  event: "checkout_created" | "plan_change_requested";
  requestedByEmail: string | null;
}) {
  try {
    const itSupportUser = await adminAuth().getUserByEmail("itsupport@omtatvadigitals.com");
    const pricing = PLAN_PRICING[params.planId];
    const amount = pricing.monthlyUsd !== null ? `$${pricing.monthlyUsd}/${pricing.billingPeriod === "forever" ? "forever" : "mo"}` : "Custom";
    await sendGmailMessage({
      uid: itSupportUser.uid,
      to: "itsupport@omtatvadigitals.com",
      subject: `${params.event === "checkout_created" ? "New plan request" : "Plan change requested"} — ${params.workspaceName}`,
      html: renderPurchaseRequestEmail(params, amount),
    });
  } catch (err) {
    if (err instanceof GmailApiError) {
      console.error("[billingNotify] notification email failed (request already recorded):", err.code, err.message);
    } else {
      console.error("[billingNotify] notification email failed (request already recorded):", err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Best-effort internal notification for a verified payment OUTCOME —
 * activation or failure (see webhook route's doc comment on why
 * "cancelled" deliberately has no email of its own: the customer-
 * facing state updates, but nothing new needs Super Admin's
 * attention). Deliberately separate from notifyPurchaseRequest's
 * "New plan request" email — this is sent only once a REAL,
 * webhook-verified event lands, and the webhook route only calls this
 * on `!duplicate`, so a retried/duplicate delivery of the identical
 * event never re-sends it.
 */
export async function notifyPaymentOutcome(params: {
  workspaceId: string;
  workspaceName: string;
  planId: WorkspacePlan;
  outcome: "activated" | "failed";
  subscriptionId: string | null;
}) {
  try {
    const itSupportUser = await adminAuth().getUserByEmail("itsupport@omtatvadigitals.com");
    const pricing = PLAN_PRICING[params.planId];
    const amount = pricing.monthlyUsd !== null ? `$${pricing.monthlyUsd}/${pricing.billingPeriod === "forever" ? "forever" : "mo"}` : "Custom";
    const planName = PLAN_DISPLAY_NAMES[params.planId];
    await sendGmailMessage({
      uid: itSupportUser.uid,
      to: "itsupport@omtatvadigitals.com",
      subject: params.outcome === "activated" ? `${planName} Subscription Activated — Omtatva Digitals` : `${planName} Payment Failed — Omtatva Digitals`,
      html: renderPaymentOutcomeEmail(params, amount, planName),
    });
  } catch (err) {
    if (err instanceof GmailApiError) {
      console.error("[billingNotify] payment-outcome email failed:", err.code, err.message);
    } else {
      console.error("[billingNotify] payment-outcome email failed:", err instanceof Error ? err.message : err);
    }
  }
}

function renderPaymentOutcomeEmail(
  params: { workspaceId: string; workspaceName: string; outcome: "activated" | "failed"; subscriptionId: string | null },
  amount: string,
  planName: string
): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">${label}</td><td style="padding:4px 0;color:#111827;font-size:13px;text-align:right;">${escapeHtml(value)}</td></tr>`;
  const headline = params.outcome === "activated" ? `${params.workspaceName}'s ${planName} subscription is now active.` : `${params.workspaceName}'s ${planName} payment failed.`;
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr><td style="padding:32px 32px 8px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${params.outcome === "activated" ? "#16a34a" : "#dc2626"};">
              ${params.outcome === "activated" ? "Subscription Activated" : "Payment Failed"}
            </p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px 32px;">
            <h1 style="margin:0;font-size:18px;line-height:1.4;color:#111827;">${escapeHtml(headline)}</h1>
          </td></tr>
          <tr><td style="padding:0 32px 32px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${row("Plan", planName)}
              ${row("Amount", amount)}
              ${row("Workspace ID", params.workspaceId)}
              ${row("Subscription ID", params.subscriptionId ?? "—")}
            </table>
          </td></tr>
          <tr><td style="padding:0 32px 32px 32px;"><a href="${escapeHtml(superAdminUrl("/super-admin/billing"))}" style="display:inline-block;padding:10px 16px;border-radius:8px;background-color:#3D6FA8;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Open Billing</a></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderPurchaseRequestEmail(
  params: { workspaceId: string; workspaceName: string; planId: WorkspacePlan; requestedByEmail: string | null },
  amount: string
): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">${label}</td><td style="padding:4px 0;color:#111827;font-size:13px;text-align:right;">${escapeHtml(value)}</td></tr>`;
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr><td style="padding:32px 32px 8px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#3D6FA8;">Purchase Request</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px 32px;">
            <h1 style="margin:0;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(params.workspaceName)}</h1>
          </td></tr>
          <tr><td style="padding:0 32px 32px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${row("Plan", PLAN_DISPLAY_NAMES[params.planId])}
              ${row("Amount", amount)}
              ${row("Requested by", params.requestedByEmail ?? "Unknown")}
              ${row("Workspace ID", params.workspaceId)}
              ${row("Payment status", "Pending — no payment provider connected yet")}
            </table>
          </td></tr>
          <tr><td style="padding:0 32px 32px 32px;"><a href="${escapeHtml(superAdminUrl("/super-admin/billing"))}" style="display:inline-block;padding:10px 16px;border-radius:8px;background-color:#3D6FA8;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Open Purchase Requests</a></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Where the Super Admin pages live — same env the invite emails use. The destination is still behind Super Admin sign-in. */
function superAdminUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
