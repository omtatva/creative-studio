import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/server/firebaseAdmin";
import { sendGmailMessage, GmailApiError } from "@/lib/server/gmailClient";
import { SalesLead } from "@/types/billing.types";

export const runtime = "nodejs";

interface SubmitLeadBody {
  name: string;
  companyName: string;
  email: string;
  phone?: string;
  teamSize?: string;
  currentWorkflow?: string;
  lookingFor?: string;
  message?: string;
  expectedProjects?: string;
  storageRequirements?: string;
  aiRequirements?: string;
  integrationsNeeded?: string;
  timeline?: string;
  workspaceId?: string;
}

/**
 * Public Enterprise "Contact Sales" submission — deliberately NO auth
 * required (a marketing-site visitor evaluating the product has no
 * account yet), which is exactly why this goes through firebase-admin
 * rather than a client Firestore write: firestore.rules denies ALL
 * direct client access to `sales_leads` (see that collection's block),
 * so an anonymous visitor could never write one directly even if this
 * route didn't exist — this is the ONLY path a lead can be created
 * through, and it does its own field validation since there's no
 * rules-level shape enforcement to fall back on.
 */
export async function POST(request: NextRequest) {
  let body: SubmitLeadBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const companyName = body.companyName?.trim();
  const email = body.email?.trim();
  if (!name || !companyName || !email) {
    return NextResponse.json({ error: "Name, company name, and work email are required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const leadRef = adminDb().collection("sales_leads").doc();
  const lead: SalesLead = {
    id: leadRef.id,
    name,
    companyName,
    email,
    phone: body.phone?.trim() || null,
    teamSize: body.teamSize?.trim() || null,
    currentWorkflow: body.currentWorkflow?.trim() || null,
    lookingFor: body.lookingFor?.trim() || null,
    message: body.message?.trim() || null,
    expectedProjects: body.expectedProjects?.trim() || null,
    storageRequirements: body.storageRequirements?.trim() || null,
    aiRequirements: body.aiRequirements?.trim() || null,
    integrationsNeeded: body.integrationsNeeded?.trim() || null,
    timeline: body.timeline?.trim() || null,
    status: "new",
    workspaceId: body.workspaceId?.trim() || null,
    activatedWorkspaceId: null,
    createdAt: now,
    updatedAt: now,
  };

  await leadRef.set(lead);

  // Best-effort — the lead is already safely saved above regardless of
  // whether this notification succeeds. Sent FROM the Super Admin
  // account's own connected Gmail (see gmailClient.ts) rather than a
  // separate email provider, per "reuse the existing secure Gmail
  // infrastructure"; if that account hasn't connected Gmail yet (see
  // Settings > Users), this simply logs and moves on — the lead is
  // still visible on the internal Sales Leads page either way.
  try {
    const itSupportUser = await adminAuth().getUserByEmail("itsupport@omtatvadigitals.com");
    await sendGmailMessage({
      uid: itSupportUser.uid,
      to: "itsupport@omtatvadigitals.com",
      subject: `New Enterprise Plan Inquiry — ${companyName}`,
      html: renderLeadEmail(lead),
    });
  } catch (err) {
    if (err instanceof GmailApiError) {
      console.error("[sales-leads] notification email failed (lead already saved):", err.code, err.message);
    } else {
      console.error("[sales-leads] notification email failed (lead already saved):", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ success: true, leadId: leadRef.id });
}

function renderLeadEmail(lead: SalesLead): string {
  const row = (label: string, value: string | null) =>
    value ? `<tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">${label}</td><td style="padding:4px 0;color:#111827;font-size:13px;text-align:right;">${escapeHtml(value)}</td></tr>` : "";
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr><td style="padding:32px 32px 8px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">New Enterprise Inquiry</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px 32px;">
            <h1 style="margin:0;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(lead.companyName)}</h1>
          </td></tr>
          <tr><td style="padding:0 32px 24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${row("Name", lead.name)}
              ${row("Email", lead.email)}
              ${row("Phone", lead.phone)}
              ${row("Team size", lead.teamSize)}
              ${row("Current workflow", lead.currentWorkflow)}
              ${row("Looking for", lead.lookingFor)}
              ${row("Expected projects", lead.expectedProjects)}
              ${row("Storage requirements", lead.storageRequirements)}
              ${row("AI requirements", lead.aiRequirements)}
              ${row("Integrations needed", lead.integrationsNeeded)}
              ${row("Timeline", lead.timeline)}
              ${row("Submitted", new Date(lead.createdAt).toLocaleString())}
            </table>
          </td></tr>
          ${lead.message ? `<tr><td style="padding:0 32px 24px 32px;border-top:1px solid #e5e7eb;"><p style="margin:16px 0 4px 0;font-size:13px;color:#9ca3af;">Message</p><p style="margin:0;font-size:14px;color:#111827;line-height:1.6;">${escapeHtml(lead.message)}</p></td></tr>` : ""}
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
