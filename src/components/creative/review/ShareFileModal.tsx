"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Globe2, Lock, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { updateFileShareSettings } from "@/services/fileService";
import { cn } from "@/lib/utils/cn";
import { FileSharePermission, FileShareSettings, FileShareVisibility, ProjectFile } from "@/types/file.types";
import { TaskActor } from "@/types/task.types";

interface ShareFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: ProjectFile;
  workspaceName: string;
  actor: TaskActor;
}

const VISIBILITY_OPTIONS: { value: FileShareVisibility; label: string; description: string; icon: typeof Lock }[] = [
  { value: "restricted", label: "Restricted", description: "Only people already on this project can open it.", icon: Lock },
  { value: "organization", label: "Anyone in your organization", description: "Any signed-in member of your workspace, even if not on this project.", icon: Users },
  { value: "anyone", label: "Anyone with the link", description: "No sign-in required — works for anyone the link is sent to.", icon: Globe2 },
];

/**
 * Google-Sheets-style sharing for ONE file's review workspace (video/
 * asset + its comments) — "Restricted" (default, unchanged project-
 * membership-only access) vs "Anyone in your organization" (any
 * workspace member, bypassing project membership) vs "Anyone with the
 * link" (works with no account at all — see lib/firebase/auth's
 * signInGuest, used silently by the /share/[token] page). Either of the
 * latter two also gets a Viewer/Commenter choice, mirroring Sheets'
 * own View/Edit split — "Commenter" here means comment/annotate only,
 * never uploading versions, deleting, or touching project settings.
 * See firestore.rules' isSharedFile/canCommentOnSharedFile for the
 * actual enforcement; this dialog only writes the settings those read.
 */
export function ShareFileModal({ isOpen, onClose, asset, workspaceName, actor }: ShareFileModalProps) {
  const toast = useToast();
  const [visibility, setVisibility] = useState<FileShareVisibility>(asset.shareSettings?.visibility ?? "restricted");
  const [permission, setPermission] = useState<FileSharePermission>(asset.shareSettings?.permission ?? "comment");
  const [shareToken, setShareToken] = useState<string | null>(asset.shareSettings?.shareToken ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setVisibility(asset.shareSettings?.visibility ?? "restricted");
    setPermission(asset.shareSettings?.permission ?? "comment");
    setShareToken(asset.shareSettings?.shareToken ?? null);
    setCopied(false);
  }, [isOpen, asset.shareSettings]);

  const shareUrl = shareToken ? `${window.location.origin}/share/${shareToken}` : null;

  async function persist(nextVisibility: FileShareVisibility, nextPermission: FileSharePermission) {
    setIsSaving(true);
    try {
      const result: FileShareSettings | null = await updateFileShareSettings(asset, asset.shareSettings, { visibility: nextVisibility, permission: nextPermission }, actor);
      setShareToken(result?.shareToken ?? null);
      toast.success(nextVisibility === "restricted" ? "Link sharing turned off" : "Sharing updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update sharing");
    } finally {
      setIsSaving(false);
    }
  }

  function selectVisibility(next: FileShareVisibility) {
    setVisibility(next);
    void persist(next, permission);
  }

  function selectPermission(next: FileSharePermission) {
    setPermission(next);
    if (visibility !== "restricted") void persist(visibility, next);
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share this file" className="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {VISIBILITY_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = visibility === option.value;
            return (
              <button
                key={option.value}
                onClick={() => selectVisibility(option.value)}
                disabled={isSaving}
                className={cn(
                  "flex items-start gap-3 rounded-theme border p-3 text-left transition-colors disabled:opacity-60",
                  isActive ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted"
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isActive ? "text-primary" : "text-foreground-muted")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", isActive ? "text-primary" : "text-foreground")}>
                    {option.value === "organization" ? `Anyone in ${workspaceName}` : option.label}
                  </p>
                  <p className="text-xs text-foreground-muted">{option.description}</p>
                </div>
                {isActive && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>

        {visibility !== "restricted" && (
          <div className="flex items-center justify-between gap-3 rounded-theme border border-border bg-surface-muted/60 px-3 py-2.5">
            <span className="text-sm font-medium text-foreground">Access level</span>
            <div className="flex items-center gap-0.5 rounded-theme border border-border bg-surface p-0.5">
              <button
                onClick={() => selectPermission("view")}
                disabled={isSaving}
                className={cn("rounded-theme px-2.5 py-1 text-xs font-medium", permission === "view" ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}
              >
                Viewer
              </button>
              <button
                onClick={() => selectPermission("comment")}
                disabled={isSaving}
                className={cn("rounded-theme px-2.5 py-1 text-xs font-medium", permission === "comment" ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}
              >
                Commenter
              </button>
            </div>
          </div>
        )}

        {shareUrl && (
          <div className="flex items-center gap-2 rounded-theme border border-border bg-surface px-3 py-2">
            <input readOnly value={shareUrl} className="min-w-0 flex-1 truncate bg-transparent text-xs text-foreground-muted outline-none" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
