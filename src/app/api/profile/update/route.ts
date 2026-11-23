import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

interface Body {
  displayName?: unknown;
  phone?: unknown;
  jobTitle?: unknown;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const PHONE = /^[0-9+()\-.\s]{5,30}$/;

/**
 * Updates the CALLER'S OWN profile (display name, phone, job title). The uid comes from the verified ID token, never the body, so nobody
 * can edit anyone else's profile. Role, email and platform authority are not editable here (and `users/{uid}.platformRole` stays
 * Admin-write-only). The new display name is also copied onto the caller's workspace member records: those are server-write-only
 * (a client can't update them), so without this the Team page would keep showing the old name.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }
  try {
    await enforceRateLimit(`profile-update:${uid}`, 20, 3600);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return NextResponse.json({ error: err.message }, { status: 429 });
    return NextResponse.json({ error: "Couldn't save your profile. Try again." }, { status: 500 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : "";
  if (displayName.length < 1 || displayName.length > 80 || CONTROL.test(displayName)) {
    return NextResponse.json({ error: "Enter your name (up to 80 characters)." }, { status: 400 });
  }
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
  if (phoneRaw && !PHONE.test(phoneRaw)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  const jobRaw = typeof body.jobTitle === "string" ? body.jobTitle.trim().replace(/\s+/g, " ") : "";
  if (jobRaw.length > 80 || CONTROL.test(jobRaw)) return NextResponse.json({ error: "Job title is too long (up to 80 characters)." }, { status: 400 });

  try {
    await adminDb().collection("users").doc(uid).set(
      { displayName, phone: phoneRaw || null, jobTitle: jobRaw || null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await adminAuth().updateUser(uid, { displayName });
    const memberships = await adminDb().collection("members").where("userId", "==", uid).get();
    for (const m of memberships.docs) await m.ref.update({ displayName, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, displayName, phone: phoneRaw || null, jobTitle: jobRaw || null });
  } catch (err) {
    console.error("[profile/update] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't save your profile. Try again." }, { status: 500 });
  }
}
