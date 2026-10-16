"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { createReviewRound, getRoundDetails, listEligibleReviewers, type EligibleReviewer } from "@/services/reviewRoundService";
import { reviewLinkUrl } from "@/services/reviewShareService";
import { ProjectFile } from "@/types/file.types";
import type { Review } from "@/types/review.types";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const EXPIRY: { value: string; label: string; days: number | null }[] = [
  { value: "never", label: "No expiry", days: null },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
];

function RequiredToggle({ required, onChange, label }: { required: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={required}
      aria-label={label}
      onClick={() => onChange(!required)}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${required ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-foreground-muted"}`}
    >
      {required ? "Required" : "Optional"}
    </button>
  );
}

/**
 * "Send for review": ONE version, any number of reviewers (team members and/or outside reviewers), each Required or Optional.
 * The server creates the round, notifies team reviewers, and emails outside reviewers a secure link — merely opening this
 * modal never notifies anyone. `prefill` (the previous round) pre-selects the same reviewers for the next round; it is never auto-sent.
 */
export function SendForReviewModal({ asset, isOpen, onClose, prefill }: { asset: ProjectFile; isOpen: boolean; onClose: () => void; prefill?: Review | null }) {
  const toast = useToast();
  const { workspaceId } = useWorkspaceContext();
  // Only people on THIS project are offered (never every workspace member), flagged by whether they can make a formal decision.
  const [eligible, setEligible] = useState<EligibleReviewer[] | null>(null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState<Record<string, boolean>>({}); // uid -> required (presence = selected)
  const [emailText, setEmailText] = useState("");
  const [externalRequired, setExternalRequired] = useState<Record<string, boolean>>({});
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("30");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ link: string | null; failures: string[] } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setResult(null);
    setTitle(`${asset.fileName} — v${asset.versionNumber} review`);
    setMessage("");
    setPassword("");
    setExpiry("30");
    setInternal({});
    setEmailText("");
    setExternalRequired({});
    setPrefillNote(null);
    setEligible(null);
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = (await listEligibleReviewers(workspaceId, asset.id)).reviewers;
        if (cancelled) return;
        setEligible(list);
        if (!prefill) return;
        // Previous round's reviewers, offered again — NOTHING is sent until the user presses Send.
        const details = await getRoundDetails(workspaceId, prefill.id);
        if (cancelled) return;
        const prev = details.reviewers.filter((r) => !r.guest && !r.removedAt);
        const byUid = new Map(list.map((m) => [m.uid, m]));
        const dropped: string[] = [];
        const internalNext: Record<string, boolean> = {};
        for (const r of prev.filter((x) => x.type === "internal" && x.uid)) {
          const m = byUid.get(r.uid as string);
          if (!m) { dropped.push(r.displayName); continue; } // no longer on the project
          internalNext[m.uid] = r.required && m.canDecide;
        }
        setInternal(internalNext);
        const ext = prev.filter((x) => x.type === "external" && x.email);
        setEmailText(ext.map((x) => x.email).join(", "));
        setExternalRequired(Object.fromEntries(ext.map((x) => [x.email as string, x.required])));
        if (dropped.length) setPrefillNote(`${dropped.join(", ")} ${dropped.length === 1 ? "is" : "are"} no longer on this project and wasn't carried over.`);
      } catch (err) {
        if (!cancelled) {
          setEligible((cur) => cur ?? []);
          toast.error(err instanceof Error ? err.message : "Couldn't load reviewers.");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, asset.id, asset.fileName, asset.versionNumber, prefill, workspaceId]);

  const emails = useMemo(() => [...new Set(emailText.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))], [emailText]);
  const invalid = emails.filter((e) => !EMAIL.test(e));
  const reviewerCount = Object.keys(internal).length + emails.length;
  const canSend = !!workspaceId && title.trim().length > 0 && reviewerCount > 0 && invalid.length === 0 && emails.length <= 20;

  async function handleSubmit() {
    if (!workspaceId || !canSend) return;
    setSaving(true);
    try {
      const days = EXPIRY.find((x) => x.value === expiry)?.days ?? null;
      const res = await createReviewRound({
        workspaceId,
        fileId: asset.id,
        title: title.trim(),
        message: message.trim() || undefined,
        internalReviewers: Object.entries(internal).map(([uid, required]) => ({ uid, required: required && (eligible?.find((m) => m.uid === uid)?.canDecide ?? false) })),
        externalReviewers: emails.map((email) => ({ email, required: externalRequired[email] !== false })),
        link: emails.length ? { password: password || undefined, expiresAt: days ? new Date(Date.now() + days * 86400000).toISOString() : null } : undefined,
      });
      toast.success(`Round ${res.roundNumber} sent for review`);
      if (res.emailFailures.length > 0 && res.token) {
        // Some invitation emails didn't go out — show the secure link once so the sender can share it themselves.
        setResult({ link: reviewLinkUrl(res.token), failures: res.emailFailures });
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send for review. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={prefill ? `Start review round ${(prefill.roundNumber ?? 0) + 1}` : "Send for review"}>
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">The round was created, but the invitation email couldn&apos;t be delivered to: {result.failures.join(", ")}.</p>
          <p className="text-xs text-foreground-muted">Share this secure link with them directly (they still confirm their email with a one-time code). It is shown only once.</p>
          <Input readOnly value={result.link ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground-muted">
            Requests approval on <span className="font-medium text-foreground">{asset.fileName}</span> — <span className="font-medium text-foreground">version {asset.versionNumber}</span>. Decisions apply to this version only.
          </p>
          <Input label="Review title" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Project members</p>
            {prefillNote && <p className="text-xs text-warning">{prefillNote}</p>}
            {eligible === null ? (
              <p className="text-xs text-foreground-muted">Loading project members…</p>
            ) : eligible.length === 0 ? (
              <p className="text-xs text-foreground-muted">No other members of this project can take part in a review yet.</p>
            ) : (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {eligible.map((m) => {
                  const selected = m.uid in internal;
                  return (
                    <li key={m.uid} className="flex items-center justify-between gap-2 rounded-theme border border-border px-2.5 py-1.5">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => setInternal((cur) => { const n = { ...cur }; if (e.target.checked) n[m.uid] = m.canDecide; else delete n[m.uid]; return n; })}
                        />
                        <span className="truncate">{m.displayName}</span>
                        {!m.canDecide && <span className="shrink-0 text-[11px] text-foreground-muted">(can view &amp; comment only)</span>}
                      </label>
                      {selected && (m.canDecide
                        ? <RequiredToggle required={internal[m.uid] !== false} label={`${m.displayName} required`} onChange={(v) => setInternal((cur) => ({ ...cur, [m.uid]: v }))} />
                        : <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground-muted">Optional</span>)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Textarea
              label="Outside reviewers (email addresses)"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              rows={2}
              placeholder="client@example.com, partner@example.com"
            />
            {invalid.length > 0 && <p className="text-xs text-error">Not a valid email: {invalid.join(", ")}</p>}
            {emails.filter((e) => EMAIL.test(e)).length > 0 && (
              <ul className="flex flex-col gap-1">
                {emails.filter((e) => EMAIL.test(e)).map((e) => (
                  <li key={e} className="flex items-center justify-between gap-2 rounded-theme border border-border px-2.5 py-1.5">
                    <span className="min-w-0 truncate text-sm text-foreground">{e}</span>
                    <RequiredToggle required={externalRequired[e] !== false} label={`${e} required`} onChange={(v) => setExternalRequired((cur) => ({ ...cur, [e]: v }))} />
                  </li>
                ))}
              </ul>
            )}
            {emails.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input label="Link password (optional)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                  Link expires
                  <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-10 rounded-theme border border-border bg-surface px-2 text-sm font-normal text-foreground">
                    {EXPIRY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
            )}
            {emails.length > 0 && <p className="text-xs text-foreground-muted">Each outside reviewer gets a secure link by email from your connected Gmail and confirms their address with a one-time code. The password is never emailed.</p>}
          </div>

          <Textarea label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={1000} />

          <div className="mt-2 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} isLoading={saving} disabled={!canSend}>
              {reviewerCount === 0 ? "Add a reviewer" : `Send to ${reviewerCount} reviewer${reviewerCount === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
