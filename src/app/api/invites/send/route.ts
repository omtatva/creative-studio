import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { sendGmailMessage, GmailApiError } from "@/lib/server/gmailClient";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";

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
 * Server-side Gmail proxy for workspace-invitation emails — replaces
 * the old Resend-backed version. The email is now sent FROM the
 * calling user's own connected Gmail account (see
 * src/lib/server/gmailClient.ts and src/app/api/auth/google/*),
 * never a shared sender.
 *
 * The old version trusted the client entirely (Firestore rules were
 * the only real gate, and this route just relayed to Resend). That's
 * no longer sufficient: a Gmail send now acts ON BEHALF OF a specific
 * user's real mailbox, so this route independently re-verifies
 * everything the client-side Firestore rules already enforce, using
 * firebase-admin (which bypasses those rules) rather than trusting
 * whatever the browser claims:
 *   1. The caller is a real, currently-authenticated Firebase user
 *      (verifyRequestAuth — never a uid read from the request body).
 *   2. The invite (looked up fresh from Firestore by inviteId, not
 *      trusted from the request body) genuinely belongs to a
 *      workspace the caller is a member of, with owner/admin role —
 *      the same bar workspace_invites' own `create`/`update` rules
 *      already enforce client-side, re-checked here server-side.
 *   3. The email address matches the invite's own record, so a
 *      tampered `email` field in the request body can't redirect
 *      the message elsewhere.
 *   4. The caller has a connected Gmail account (enforced inside
 *      sendGmailMessage, which throws a typed, specific error
 *      otherwise).
 *
 * Request body shape, invite-link generation, and the HTML email
 * template are all unchanged from the Resend version — only the
 * transport (Gmail API instead of Resend) and the authorization
 * checks around it are new.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    const message = err instanceof Error ? err.message : "Authentication failed.";
    return NextResponse.json({ error: message }, { status });
  }

  try {
    await enforceRateLimit(`invite-send:${uid}`, 30, 3600);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

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

  // Source of truth for workspaceId/email is the invite document
  // itself, read fresh here — never the request body — so a client
  // can't claim an invite belongs to a workspace it doesn't, or
  // redirect the email to an address the invite wasn't actually
  // created for.
  const inviteSnapshot = await adminDb().collection("workspace_invites").doc(inviteId).get();
  if (!inviteSnapshot.exists) {
    return NextResponse.json({ error: "This invitation no longer exists." }, { status: 404 });
  }
  const invite = inviteSnapshot.data() as { workspaceId?: string; email?: string };
  if (!invite.workspaceId || !invite.email) {
    return NextResponse.json({ error: "This invitation is missing required data." }, { status: 500 });
  }
  if (invite.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json({ error: "The invitation's recipient doesn't match this request." }, { status: 400 });
  }

  const memberSnapshot = await adminDb().collection("members").doc(`${invite.workspaceId}_${uid}`).get();
  const memberRole = memberSnapshot.exists ? (memberSnapshot.data()?.role as string | undefined) : undefined;
  if (!memberRole || !["owner", "admin"].includes(memberRole)) {
    return NextResponse.json({ error: "Only workspace owners and admins can send invitations." }, { status: 403 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteLink = `${appUrl.replace(/\/$/, "")}/invite/${inviteId}`;
  const expiresLabel = new Date(expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  try {
    await sendGmailMessage({
      uid,
      to: email,
      subject: `You're invited to join ${workspaceName} on Omtatva Digitals`,
      html: renderInviteEmail({ workspaceName, roleLabel, invitedByName, inviteLink, expiresLabel }),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof GmailApiError) {
      console.error("[invites/send] Gmail send failed:", { code: err.code, status: err.status, message: err.message });
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[invites/send] unexpected error sending via Gmail:", err);
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
