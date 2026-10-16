import { NextRequest, NextResponse } from "next/server";
import { authorizeShare, resolveScopedFile } from "@/lib/server/reviewShare";
import { streamStorageObject } from "@/lib/server/mediaStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AUTHENTICATED MEDIA PROXY for external reviewers — playback/preview, which is
 * a SEPARATE permission from download. The bytes are streamed through the server
 * (see lib/server/mediaStream.ts: Range support, piped not buffered) after the
 * SAME gate every reviewer action uses (valid token, not revoked, not expired,
 * password/email gates satisfied via the HttpOnly session cookie, and the
 * requested version inside the share's scope). The permanent Firebase token URL
 * in `file.url` is never sent to a reviewer, so revoking or expiring a link cuts
 * off media on the next request, not "eventually". Version comparison simply
 * opens two of these streams (one per selected version) — each is authorized
 * independently, so a compare can never reach a version the link doesn't allow.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  const versionParam = request.nextUrl.searchParams.get("v");
  const version = versionParam === null ? undefined : Number(versionParam);
  if (versionParam !== null && !Number.isInteger(version)) return NextResponse.json({ error: "Invalid version." }, { status: 400 });

  const auth = await authorizeShare(request, token);
  if (!auth.ok) return auth.response;
  const { share, file } = auth.gate;

  const scoped = await resolveScopedFile(share, file, version);
  if (!scoped || !scoped.storagePath.startsWith(`workspaces/${share.workspaceId}/projects/${share.projectId}/`)) {
    return NextResponse.json({ error: "That version isn't available." }, { status: 403 });
  }
  // Non-previewable types are only streamed (as attachments) when the link also allows downloads.
  return streamStorageObject(request, scoped.storagePath, scoped.contentType, { allowNonInline: share.permissions.canDownload });
}
