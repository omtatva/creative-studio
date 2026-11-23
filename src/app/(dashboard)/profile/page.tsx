"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, MailWarning, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useToast } from "@/hooks/useToast";
import { updateMyProfile } from "@/services/profileService";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { formatDate } from "@/lib/utils/date";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Employee", viewer: "Viewer" };

/**
 * "My profile" — what the signed-in person's account holds, and the fields they can fix themselves (name, phone, job title).
 * Email, workspace role and platform role are shown read-only: they are changed by an administrator, never from here.
 */
export default function ProfilePage() {
  const { firebaseUser, profile, refreshProfile, isLoading } = useAuthContext();
  const { workspace } = useWorkspaceContext();
  const { role } = useCurrentMemberRole();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Some accounts (e.g. one whose profile doc was first written by the platform-role sync) have no name/email/created date stored on the profile doc —
  // the sign-in account itself always has them, so fall back to that instead of showing blanks.
  const accountEmail = profile?.email || firebaseUser?.email || "";
  const fallbackName = firebaseUser?.displayName ?? "";
  const accountName = profile?.displayName || fallbackName;
  const accountCreated = profile?.createdAt || firebaseUser?.metadata?.creationTime || null;

  useEffect(() => {
    if (!profile) return;
    setName(profile.displayName || fallbackName);
    setPhone(profile.phone ?? "");
    setJobTitle(profile.jobTitle ?? "");
  }, [profile, fallbackName]);

  if (isLoading || !profile) return <Loader label="Loading your profile..." />;

  const dirty = name.trim() !== accountName || phone.trim() !== (profile.phone ?? "") || jobTitle.trim() !== (profile.jobTitle ?? "");
  const missing = [!accountName.trim() && "name", !profile.phone && "phone number", !profile.jobTitle && "job title"].filter(Boolean) as string[];
  const isSuperAdmin = isSuperAdminUser(profile);
  const emailVerified = firebaseUser?.emailVerified ?? false;

  async function save() {
    if (!name.trim()) {
      toast.error("Enter your name.");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({ displayName: name, phone, jobTitle });
      await refreshProfile();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">My profile</h1>
        <p className="mt-1 text-sm text-foreground-muted">Your account details. Update anything that is missing or out of date.</p>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={accountName || accountEmail || "User"} src={profile.photoURL} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-foreground">{accountName || "(no name yet)"}</p>
            <p className="truncate text-sm text-foreground-muted">{accountEmail}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {isSuperAdmin && <Badge variant="info"><ShieldCheck className="mr-1 h-3 w-3" /> Super Admin</Badge>}
              {role && <Badge>{ROLE_LABEL[role] ?? role}{workspace ? ` · ${workspace.name}` : ""}</Badge>}
              {emailVerified ? <Badge variant="success"><BadgeCheck className="mr-1 h-3 w-3" /> Email verified</Badge> : <Badge variant="warning"><MailWarning className="mr-1 h-3 w-3" /> Email not verified</Badge>}
            </div>
          </div>
        </div>
        {missing.length > 0 && <p className="mt-4 rounded-theme bg-warning/10 px-3 py-2 text-xs text-foreground">Missing: {missing.join(", ")}. Add them below.</p>}
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <Input label="Full name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <Input label="Email" value={accountEmail} readOnly disabled hint="Your sign-in email can't be changed here." />
          <Input label="Phone number" type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          <Input label="Job title" value={jobTitle} maxLength={80} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Video editor" />
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-foreground-muted">
              {workspace ? `Workspace: ${workspace.name}` : "No workspace selected"}
              {accountCreated ? ` · Account created ${formatDate(accountCreated)}` : ""}
            </p>
            <Button onClick={save} isLoading={saving} disabled={!dirty || !name.trim()}>Save changes</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
