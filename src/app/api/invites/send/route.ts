import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

interface SendInviteEmailBody {
  inviteId: string;
  email: string;
  workspaceName: string;
  role: string;
  invitedByName: string;
  expiresAt: string;
}

/**
 * Server-side Resend proxy for workspace-invitation emails — same
 * pattern as src/app/api/ai-studio/generate/route.ts: the API key is
 * read ONLY from the server-side env var RESEND_API_KEY, never sent
 * by the client, never stored in Firestore, never in the client
 * bundle. Called by inviteService.ts's sendInviteEmail() right after
 * a workspace_invites doc is created or resent — Firestore rules
 * already restrict WHO can reach that point (owner/admin only, see
 * firestore.rules), so this route's only job is the actual send.
 */
export async function POST(request: NextRequest) {
  let body: SendInviteEmailBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { inviteId, email, workspaceName, role, invitedByName, expiresAt } = body;
  if (!inviteId || !email || !workspaceName || !role || !invitedByName || !expiresAt) {
    return NextResponse.json({ error: "Missing required invitation fields." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[invites/send] RESEND_API_KEY is not set in the server environment.");
    return NextResponse.json(
      { error: "Email delivery isn't configured yet — the server is missing a Resend API key. Add RESEND_API_KEY to .env.local and restart the server." },
      { status: 503 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteLink = `${appUrl.replace(/\/$/, "")}/invite/${inviteId}`;
  const from = process.env.RESEND_FROM_EMAIL || "Omtatva Digitals <onboarding@resend.dev>";
  const expiresLabel = new Date(expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: `You're invited to join ${workspaceName} on Omtatva Digitals`,
      html: renderInviteEmail({ workspaceName, roleLabel, invitedByName, inviteLink, expiresLabel }),
    });

    if (error) {
      console.error("[invites/send] Resend rejected the email:", error);
      return NextResponse.json({ error: `Email delivery failed: ${error.message}` }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invites/send] Resend call threw:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Email delivery failed: ${message}` }, { status: 502 });
  }
}

function renderInviteEmail({
  workspaceName,
  roleLabel,
  invitedByName,
  inviteLink,
  expiresLabel,
}: {
  workspaceName: string;
  roleLabel: string;
  invitedByName: string;
  inviteLink: string;
  expiresLabel: string;
}): string {
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">Omtatva Digitals</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;color:#111827;">You're invited to join ${escapeHtml(workspaceName)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 24px 32px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
                  ${escapeHtml(invitedByName)} invited you to collaborate on <strong>${escapeHtml(workspaceName)}</strong> as a <strong>${escapeHtml(roleLabel)}</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <a href="${inviteLink}" style="display:inline-block;background-color:#6366f1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">
                  Accept Invitation
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px 32px;border-top:1px solid #e5e7eb;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#9ca3af;">Workspace</td>
                    <td style="padding:4px 0;font-size:13px;color:#111827;text-align:right;">${escapeHtml(workspaceName)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#9ca3af;">Role</td>
                    <td style="padding:4px 0;font-size:13px;color:#111827;text-align:right;">${escapeHtml(roleLabel)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#9ca3af;">Invited by</td>
                    <td style="padding:4px 0;font-size:13px;color:#111827;text-align:right;">${escapeHtml(invitedByName)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
                  This invitation expires on ${escapeHtml(expiresLabel)}. If you weren't expecting this, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
