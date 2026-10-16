import "server-only";
import { sendGmailMessage } from "@/lib/server/gmailClient";

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * The email an EXTERNAL reviewer receives when a review round is sent. Sent from the sender's
 * own connected Gmail (the same infrastructure as workspace invitations). It carries ONLY the
 * secure review link — never a password (the sender shares that separately), never an internal
 * workspace link, never a Firebase/Storage URL. Specific-email links additionally require the
 * recipient to confirm their address with a one-time code before anything opens.
 */
export async function sendReviewRequestEmail(args: {
  senderUid: string;
  senderName: string;
  to: string;
  workspaceName: string;
  projectName: string;
  assetName: string;
  version: number;
  roundNumber: number;
  message: string | null;
  link: string;
  expiresAt: string | null;
  passwordProtected: boolean;
}): Promise<void> {
  const { senderName, workspaceName, projectName, assetName, version, roundNumber, message, link, expiresAt, passwordProtected } = args;
  const expires = expiresAt ? new Date(expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr><td style="padding:32px 32px 8px 32px;"><p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#3D6FA8;">${escapeHtml(workspaceName)} · Review request</p></td></tr>
      <tr><td style="padding:8px 32px 8px 32px;"><h1 style="margin:0;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(senderName)} asked you to review ${escapeHtml(assetName)}</h1></td></tr>
      <tr><td style="padding:0 32px 16px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">Project: <strong>${escapeHtml(projectName)}</strong><br/>Version ${version} · Review round ${roundNumber}</p></td></tr>
      ${message ? `<tr><td style="padding:0 32px 16px 32px;"><p style="margin:0;padding:12px;border-radius:8px;background:#f3f6fb;font-size:14px;line-height:1.6;color:#111827;white-space:pre-wrap;">${escapeHtml(message)}</p></td></tr>` : ""}
      <tr><td style="padding:0 32px 24px 32px;"><a href="${escapeHtml(link)}" style="display:inline-block;background-color:#3D6FA8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Open the review</a></td></tr>
      <tr><td style="padding:0 32px 32px 32px;"><p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">You'll confirm your email with a one-time code before the review opens.${passwordProtected ? " This review is also password protected — ask the sender for the password." : ""}${expires ? ` The link expires on ${escapeHtml(expires)}.` : ""} Only you can use this invitation; please don't forward it.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  await sendGmailMessage({ uid: args.senderUid, to: args.to, subject: `${senderName} asked you to review "${assetName}"`, html });
}
