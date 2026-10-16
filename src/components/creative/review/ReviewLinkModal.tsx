"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Lock, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { useToast } from "@/hooks/useToast";
import { createReviewLink, listReviewLinks, reviewLinkUrl, revokeReviewLink, updateReviewLink } from "@/services/reviewShareService";
import { turnOffLegacyFileShare } from "@/services/fileService";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_REVIEW_SHARE_PERMISSIONS, type ReviewShareAccessMode, type ReviewSharePermissions, type ReviewShareSummary } from "@/types/reviewShare.types";
import type { ProjectFile } from "@/types/file.types";
import { ROUND_STATUS_LABEL } from "@/lib/reviewRounds";

interface ReviewLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: ProjectFile;
}

type ExpiryChoice = "none" | "1d" | "7d" | "30d" | "custom";
const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string }[] = [
  { value: "none", label: "No expiration" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom date…" },
];

function expiryToIso(choice: ExpiryChoice, custom: string): string | null | undefined {
  if (choice === "none") return null;
  if (choice === "custom") return custom ? new Date(custom).toISOString() : undefined;
  const days = choice === "1d" ? 1 : choice === "7d" ? 7 : 30;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

const PERMISSION_ROWS: { key: "canComment" | "approval" | "canDownload" | "canViewPreviousVersions"; label: string; hint: string }[] = [
  { key: "canComment", label: "Allow comments", hint: "Timestamp and on-frame comments, plus drawn annotations." },
  { key: "approval", label: "Allow approval / request changes", hint: "Approve or send the version back." },
  { key: "canDownload", label: "Allow download", hint: "Off by default — viewing never requires it." },
  { key: "canViewPreviousVersions", label: "Allow previous versions", hint: "Show earlier versions of this asset." },
];

function PermissionToggles({ value, onChange, disabled }: { value: ReviewSharePermissions; onChange: (next: ReviewSharePermissions) => void; disabled?: boolean }) {
  const isOn = (key: (typeof PERMISSION_ROWS)[number]["key"]) => (key === "approval" ? value.canApprove && value.canRequestChanges : value[key]);
  function toggle(key: (typeof PERMISSION_ROWS)[number]["key"]) {
    if (key === "approval") {
      const next = !isOn("approval");
      onChange({ ...value, canApprove: next, canRequestChanges: next });
    } else onChange({ ...value, [key]: !value[key] });
  }
  return (
    <div className="flex flex-col gap-2">
      {PERMISSION_ROWS.map((row) => (
        <label key={row.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={isOn(row.key)} disabled={disabled} onChange={() => toggle(row.key)} />
          <span>
            <span className="font-medium text-foreground">{row.label}</span>
            <span className="block text-xs text-foreground-muted">{row.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ExpiryPicker({ choice, custom, onChoice, onCustom }: { choice: ExpiryChoice; custom: string; onChoice: (c: ExpiryChoice) => void; onCustom: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={choice} onChange={(e) => onChoice(e.target.value as ExpiryChoice)} className="h-9 rounded-theme border border-border bg-surface px-2 text-sm text-foreground">
        {EXPIRY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {choice === "custom" && <input type="datetime-local" value={custom} onChange={(e) => onCustom(e.target.value)} className="h-9 rounded-theme border border-border bg-surface px-2 text-sm text-foreground" />}
    </div>
  );
}

const STATUS_BADGE: Record<ReviewShareSummary["status"], "success" | "warning" | "danger"> = { active: "success", expired: "warning", revoked: "danger" };

/**
 * Create / manage EXTERNAL review links for one asset. These are a separate
 * authorization model from workspace and project membership: reviewers never
 * become members (see /api/review/*). The link itself is shown only when it is
 * created or regenerated — the server keeps just a hash — so "Copy link" for an
 * older link means regenerating it (which invalidates the previous URL).
 */
export function ReviewLinkModal({ isOpen, onClose, asset }: ReviewLinkModalProps) {
  const toast = useToast();
  const [shares, setShares] = useState<ReviewShareSummary[] | null>(null);
  const [freshUrl, setFreshUrl] = useState<{ shareId: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // create form
  const [accessMode, setAccessMode] = useState<ReviewShareAccessMode>("anyone_with_link");
  const [emails, setEmails] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState<ExpiryChoice>("none");
  const [customExpiry, setCustomExpiry] = useState("");
  const [permissions, setPermissions] = useState<ReviewSharePermissions>(DEFAULT_REVIEW_SHARE_PERMISSIONS);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<ReviewSharePermissions>(DEFAULT_REVIEW_SHARE_PERMISSIONS);
  const [editExpiry, setEditExpiry] = useState<ExpiryChoice>("none");
  const [editCustomExpiry, setEditCustomExpiry] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { shares: list } = await listReviewLinks(asset.workspaceId, asset.id);
      setShares(list);
    } catch (err) {
      console.error("[ReviewLinkModal] couldn't load links:", err);
      setShares([]);
    }
  }, [asset.workspaceId, asset.id]);

  useEffect(() => {
    if (!isOpen) return;
    setFreshUrl(null);
    setCopied(false);
    setEditingId(null);
    void refresh();
  }, [isOpen, refresh]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  async function handleCreate() {
    const expiresAt = expiryToIso(expiry, customExpiry);
    if (expiresAt === undefined) return toast.error("Pick an expiration date.");
    const emailList = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    if (accessMode === "specific_emails" && emailList.length === 0) return toast.error("Enter at least one email address.");
    if (usePassword && password.length < 6) return toast.error("Use a password of at least 6 characters.");
    setIsCreating(true);
    try {
      const result = await createReviewLink({
        workspaceId: asset.workspaceId,
        fileId: asset.id,
        accessMode,
        emails: accessMode === "specific_emails" ? emailList : undefined,
        password: usePassword ? password : undefined,
        expiresAt,
        permissions,
        title: title.trim() || undefined,
      });
      setFreshUrl({ shareId: result.share.id, url: reviewLinkUrl(result.token) });
      setPassword("");
      toast.success("Review link created");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the link");
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(share: ReviewShareSummary) {
    setEditingId(share.id);
    setEditPermissions(share.permissions);
    setEditExpiry(share.expiresAt ? "custom" : "none");
    setEditCustomExpiry(share.expiresAt ? new Date(share.expiresAt).toISOString().slice(0, 16) : "");
    setEditPassword("");
  }

  async function saveEdit(share: ReviewShareSummary, opts: { removePassword?: boolean } = {}) {
    const expiresAt = expiryToIso(editExpiry, editCustomExpiry);
    if (expiresAt === undefined) return toast.error("Pick an expiration date.");
    setBusyId(share.id);
    try {
      const patch: Record<string, unknown> = { permissions: editPermissions, expiresAt };
      if (opts.removePassword) patch.password = null;
      else if (editPassword) patch.password = editPassword;
      await updateReviewLink(share.id, patch);
      toast.success("Access updated");
      setEditingId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the link");
    } finally {
      setBusyId(null);
    }
  }

  async function regenerate(share: ReviewShareSummary) {
    setBusyId(share.id);
    try {
      const result = await updateReviewLink(share.id, { regenerate: true });
      if (result.token) setFreshUrl({ shareId: share.id, url: reviewLinkUrl(result.token) });
      toast.success("New link generated — the previous URL no longer works");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't regenerate the link");
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(share: ReviewShareSummary) {
    setBusyId(share.id);
    try {
      await revokeReviewLink(share.id);
      if (freshUrl?.shareId === share.id) setFreshUrl(null);
      toast.success("Link revoked — access is cut off immediately");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke the link");
    } finally {
      setBusyId(null);
    }
  }

  async function turnOffLegacy() {
    try {
      await turnOffLegacyFileShare(asset, asset.shareSettings);
      toast.success("Old public link turned off");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't turn off the old link");
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share for external review" className="max-w-xl">
      <div className="flex max-h-[75vh] flex-col gap-5 overflow-y-auto pr-1">
        {asset.shareSettings && asset.shareSettings.visibility !== "restricted" && (
          <div className="flex items-start gap-3 rounded-theme border border-warning/40 bg-warning/10 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1 text-xs text-foreground">
              <p className="font-medium">An older public link is still active for this file.</p>
              <p className="text-foreground-muted">It predates review links: it has no expiry, password or revoke control. Turn it off and share with a review link instead.</p>
            </div>
            <Button size="sm" variant="outline" onClick={turnOffLegacy}>Turn off</Button>
          </div>
        )}

        <section className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Create review link</p>
            <p className="text-xs text-foreground-muted">For clients and reviewers — they don&apos;t need an account and never become workspace or project members.</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Access</p>
            {([
              { value: "anyone_with_link", label: "Anyone with the link", hint: "Anyone you send it to can open it." },
              { value: "specific_emails", label: "Specific email addresses", hint: "Each person verifies with a one-time code emailed from your Gmail." },
            ] as const).map((o) => (
              <label key={o.value} className={cn("flex cursor-pointer items-start gap-2.5 rounded-theme border p-2.5 text-sm", accessMode === o.value ? "border-primary bg-primary/5" : "border-border")}>
                <input type="radio" name="review-access" className="mt-1 accent-primary" checked={accessMode === o.value} onChange={() => setAccessMode(o.value)} />
                <span>
                  <span className="font-medium text-foreground">{o.label}</span>
                  <span className="block text-xs text-foreground-muted">{o.hint}</span>
                </span>
              </label>
            ))}
            {accessMode === "specific_emails" && (
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={2}
                placeholder="client@example.com, reviewer@example.com"
                className="w-full rounded-theme border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" className="accent-primary" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
              <Lock className="h-3.5 w-3.5 text-foreground-muted" /> Password protect
            </label>
            {usePassword && <Input type="password" autoComplete="new-password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Expiration</p>
            <ExpiryPicker choice={expiry} custom={customExpiry} onChoice={setExpiry} onCustom={setCustomExpiry} />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Permissions</p>
            <PermissionToggles value={permissions} onChange={setPermissions} />
          </div>

          <Input label="Title (optional)" placeholder="e.g. Teaser v2 — client review" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />

          <Button onClick={handleCreate} isLoading={isCreating}>
            <Link2 className="h-4 w-4" />
            Create review link
          </Button>

          {freshUrl && (
            <div className="rounded-theme border border-primary/40 bg-primary/5 p-3">
              <p className="mb-2 text-xs font-medium text-foreground">Your link — copy it now. For security it can&apos;t be shown again; use Regenerate if you lose it.</p>
              <div className="flex items-center gap-2">
                <input readOnly value={freshUrl.url} className="min-w-0 flex-1 truncate rounded-theme border border-border bg-surface px-2 py-1.5 text-xs text-foreground-muted outline-none" onFocus={(e) => e.currentTarget.select()} />
                <Button size="sm" variant="outline" onClick={() => copy(freshUrl.url)}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <a href={freshUrl.url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </Button>
                </a>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-sm font-semibold text-foreground">Review links for this asset</p>
          {shares === null ? (
            <Loader label="Loading links..." />
          ) : shares.length === 0 ? (
            <p className="text-xs text-foreground-muted">No review links yet.</p>
          ) : (
            shares.map((share) => {
              const isEditing = editingId === share.id;
              const isLive = share.status === "active";
              return (
                <div key={share.id} className="rounded-theme border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_BADGE[share.status]} className="capitalize">{share.status}</Badge>
                    <Badge variant="info">Round {share.roundNumber} · {ROUND_STATUS_LABEL[share.roundStatus]}</Badge>
                    <span className="text-xs text-foreground-muted">v{share.version}</span>
                    {share.title && <span className="truncate text-xs font-medium text-foreground">{share.title}</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-foreground-muted">
                    {share.accessMode === "specific_emails" ? `Specific emails (${share.allowedEmails.length})` : "Anyone with the link"}
                    {share.passwordProtected ? " · password" : ""}
                    {" · "}
                    {share.expiresAt ? `expires ${formatDate(share.expiresAt)}` : "no expiration"}
                    {" · created by "}
                    {share.createdByName} on {formatDate(share.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    Can:{" "}
                    {[share.permissions.canComment && "comment", share.permissions.canApprove && "approve", share.permissions.canRequestChanges && "request changes", share.permissions.canDownload && "download", share.permissions.canViewPreviousVersions && "view previous versions"]
                      .filter(Boolean)
                      .join(", ") || "view only"}
                  </p>

                  {isLive && !isEditing && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => startEdit(share)}>Edit access</Button>
                      <Button size="sm" variant="outline" onClick={() => regenerate(share)} isLoading={busyId === share.id}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        New link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => revoke(share)} disabled={busyId === share.id}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </div>
                  )}

                  {isEditing && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                      <PermissionToggles value={editPermissions} onChange={setEditPermissions} />
                      <ExpiryPicker choice={editExpiry} custom={editCustomExpiry} onChoice={setEditExpiry} onCustom={setEditCustomExpiry} />
                      <Input type="password" autoComplete="new-password" label={share.passwordProtected ? "Change password (leave blank to keep)" : "Add a password (optional)"} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} />
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" onClick={() => saveEdit(share)} isLoading={busyId === share.id}>Save</Button>
                        {share.passwordProtected && <Button size="sm" variant="outline" onClick={() => saveEdit(share, { removePassword: true })}>Remove password</Button>}
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>

      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
