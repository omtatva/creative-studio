"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Eye, History, MessageSquare, Settings2, UserPlus, X, XCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ReviewStatusBadge } from "@/components/reviews/ReviewStatusBadge";
import { useToast } from "@/hooks/useToast";
import {
  decideReviewRound, getRoundCapabilities, getRoundDetails, listEligibleReviewers, manageReviewRound, markRoundViewed,
  type EligibleReviewer, type RoundReviewerDetail,
} from "@/services/reviewRoundService";
import {
  activeReviewers, aggregateRound, isRoundOpen, normalizeRoundStatus, pickRound, progressLabel, REVIEWER_STATUS_LABEL, reviewerStatus, shouldOfferNextRound,
  type ReviewerStatus, type RoundReviewer,
} from "@/lib/reviewRounds";
import { formatDate, timeAgo } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import type { ProjectFile } from "@/types/file.types";
import type { Review } from "@/types/review.types";

/** Status is always TEXT + ICON (never colour alone). */
const STATUS_ICON: Record<ReviewerStatus, { icon: typeof Clock; cls: string }> = {
  waiting: { icon: Clock, cls: "text-foreground-muted" },
  viewed: { icon: Eye, cls: "text-info" },
  commented: { icon: MessageSquare, cls: "text-info" },
  approved: { icon: CheckCircle2, cls: "text-success" },
  changes_requested: { icon: XCircle, cls: "text-error" },
};

interface ReviewRoundPanelProps {
  workspaceId: string;
  asset: ProjectFile;
  /** Every v2 round of THIS asset (all versions), newest first. These documents carry no private reviewer data. */
  rounds: Review[];
  currentUid: string;
  /** The round the user chose (history, or a ?round= deep link). null = the default round for the version on screen. */
  selectedRoundId: string | null;
  /** Choosing a round of another version also switches the viewed version, so decisions are never shown beside the wrong version. */
  onSelectRound: (round: Review) => void;
  /** Opens the Send-for-Review modal; `prefill` = the previous round whose reviewers should be offered again. */
  onStartRound: (prefill: Review | null) => void;
}

function ReviewerRow({ r, detail, manage, onToggleRequired, onRemove, onReplace, replacements, busy }: {
  r: RoundReviewer; detail: RoundReviewerDetail | undefined; manage: boolean; onToggleRequired: () => void; onRemove: () => void;
  onReplace: (uid: string) => void; replacements: EligibleReviewer[]; busy: boolean;
}) {
  const status = reviewerStatus(r);
  const { icon: Icon, cls } = STATUS_ICON[status];
  const when = r.decidedAt ?? r.commentedAt ?? r.firstViewedAt;
  const cap = detail?.capability ?? null;
  const gone = !!cap && !cap.canView; // removed from the project / suspended
  const cannotDecide = !!cap && cap.canView && !cap.canDecide && r.required;
  const open = !r.removedAt;
  return (
    <li className="flex flex-col gap-1.5 rounded-theme border border-border bg-surface p-2.5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={r.displayName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{r.displayName}{r.removedAt ? " (removed)" : ""}</p>
            <p className="truncate text-xs text-foreground-muted">
              {r.guest ? "Guest (link)" : r.type === "internal" ? "Team" : manage && detail?.email ? detail.email : "Outside reviewer"} · {r.required ? "Required" : "Optional"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", cls)}>
            <Icon className="h-3.5 w-3.5" aria-hidden /> {REVIEWER_STATUS_LABEL[status]}
            {when && <span className="font-normal text-foreground-muted"> · {timeAgo(when)}</span>}
          </span>
          {manage && open && (
            <>
              {!r.guest && (
                <button type="button" disabled={busy} onClick={onToggleRequired} className="rounded-theme border border-border px-2 py-0.5 text-xs text-foreground-muted hover:bg-surface-muted disabled:opacity-50">
                  Make {r.required ? "optional" : "required"}
                </button>
              )}
              <button type="button" disabled={busy} onClick={onRemove} aria-label={`Remove ${r.displayName}`} className="rounded-theme p-1 text-foreground-muted hover:bg-surface-muted disabled:opacity-50">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {manage && (gone || cannotDecide) && !r.decision && (
        <div className="flex flex-col gap-1.5 rounded-theme bg-warning/10 p-2 text-xs text-foreground">
          <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
            {gone ? `${r.displayName} no longer has access to this project, so this review can't wait on them.` : `${r.displayName} can't approve reviews any more, so a required decision from them can't be made.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {replacements.length > 0 && (
              <select aria-label={`Replace ${r.displayName}`} disabled={busy} defaultValue="" onChange={(e) => e.target.value && onReplace(e.target.value)} className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground">
                <option value="">Replace with…</option>
                {replacements.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
              </select>
            )}
            {r.required && <Button size="sm" variant="outline" disabled={busy} onClick={onToggleRequired}>Make optional</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={onRemove}>Remove</Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ReviewRoundPanel({ workspaceId, asset, rounds, currentUid, selectedRoundId, onSelectRound, onStartRound }: ReviewRoundPanelProps) {
  const toast = useToast();
  const latest = rounds[0] ?? null;
  // Default to the round for the version being viewed, else the newest round.
  const [showHistory, setShowHistory] = useState(false);
  const [managing, setManaging] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [addUid, setAddUid] = useState("");
  const [caps, setCaps] = useState<{ isReviewer: boolean; canDecide: boolean; canManage: boolean } | null>(null);
  const [details, setDetails] = useState<RoundReviewerDetail[] | null>(null);
  const [eligible, setEligible] = useState<EligibleReviewer[]>([]);

  // An unknown / unauthorized ?round= is simply not in this list (the rules scope the list to your projects) → falls back to the default.
  const { round, isHistorical } = pickRound(rounds, selectedRoundId, asset.id);
  const reviewers = useMemo(() => Object.values(round?.reviewers ?? {}), [round]);
  const active = activeReviewers(reviewers);
  const summary = aggregateRound(reviewers);
  const status = round ? normalizeRoundStatus(round.status) : null;
  const open = !!round && isRoundOpen({ status: status!, supersededByRoundId: round.supersededByRoundId });
  const myKey = `u_${currentUid}`;
  const me = round?.reviewers?.[myKey];
  const canManage = !!round && (open || status === "draft") && !!caps?.canManage;
  const roundId = round?.id ?? null;
  const roundStamp = `${round?.status}|${Object.keys(round?.reviewers ?? {}).length}|${round?.supersededByRoundId ?? ""}`;

  // What I can do on this round NOW — derived by the server (project membership, role, Feature Access) every time the round changes.
  useEffect(() => {
    if (!roundId) { setCaps(null); return; }
    let cancelled = false;
    getRoundCapabilities(workspaceId, roundId).then((c) => { if (!cancelled) setCaps(c); }).catch(() => { if (!cancelled) setCaps(null); });
    return () => { cancelled = true; };
  }, [workspaceId, roundId, roundStamp]);

  // An internal reviewer counts as having VIEWED only when they actually open the round in the workspace (never from a list or modal).
  const viewedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!round || !caps?.isReviewer || me?.firstViewedAt || !open || status === "draft") return;
    if (viewedFor.current === round.id) return;
    viewedFor.current = round.id;
    markRoundViewed(workspaceId, round.id).catch(() => undefined);
  }, [round, caps?.isReviewer, me?.firstViewedAt, open, status, workspaceId]);

  // Manager-only detail (outside reviewers' addresses, who has lost access) + the picker, loaded only while managing.
  const loadManageData = useCallback(async () => {
    if (!roundId || !asset.id) return;
    try {
      const [d, e] = await Promise.all([getRoundDetails(workspaceId, roundId), listEligibleReviewers(workspaceId, asset.id)]);
      setDetails(d.reviewers);
      setEligible(e.reviewers);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load reviewer details.");
    }
  }, [workspaceId, roundId, asset.id, toast]);
  useEffect(() => {
    if (managing && canManage) void loadManageData();
    else setDetails(null);
  }, [managing, canManage, loadManageData, roundStamp]);
  useEffect(() => { setManaging(false); setNote(""); }, [roundId]);

  const detailByKey = useMemo(() => new Map((details ?? []).map((d) => [d.key, d])), [details]);
  const takenUids = new Set(reviewers.filter((r) => !r.removedAt && r.uid).map((r) => r.uid as string));
  const addable = eligible.filter((m) => !takenUids.has(m.uid));

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      if (managing) await loadManageData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // A newer version exists than the latest round's version, and that round is finished/superseded → offer (never auto-send) the next round.
  const showNextRoundPrompt = shouldOfferNextRound(latest, asset);

  if (!round) {
    return (
      <div className="flex flex-col gap-2 border-b border-border bg-surface-muted/50 p-3">
        <p className="text-xs font-medium text-foreground">No active review</p>
        <p className="text-xs text-foreground-muted">Send this version to teammates or outside reviewers and track who has approved.</p>
        <Button size="sm" variant="outline" onClick={() => onStartRound(null)}>Send for review</Button>
      </div>
    );
  }

  return (
    <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto border-b border-border bg-surface-muted/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Round {round.roundNumber} · v{round.version}</p>
          <p className="text-xs text-foreground-muted">{progressLabel(summary)}</p>
          <p className="text-[11px] text-foreground-muted">
            Requested {formatDate(round.requestedAt ?? round.createdAt)}{round.completedAt ? ` · Completed ${formatDate(round.completedAt)}` : ""}
          </p>
        </div>
        <ReviewStatusBadge status={status!} />
      </div>

      {isHistorical && (
        <p className="rounded-theme bg-surface px-2.5 py-1.5 text-xs text-foreground-muted">
          Historical round — read only.{" "}
          <button type="button" className="text-primary hover:underline" onClick={() => latest && onSelectRound(latest)}>Back to current</button>
        </p>
      )}
      {round.supersededByRoundId && !isHistorical && <p className="text-xs text-foreground-muted">A newer round has started — this one no longer takes decisions.</p>}
      {round.fileId && round.fileId !== asset.id && (
        <p className="text-xs text-foreground-muted">This decision applies to v{round.version}, not the version you are viewing (v{asset.versionNumber}).</p>
      )}
      {status === "approved" && <p className="text-xs text-success">Approved by all required reviewers for v{round.version}.</p>}
      {status === "changes_requested" && <p className="text-xs text-error">Changes were requested on v{round.version}. Upload a new version and start the next round.</p>}
      {summary.requiredTotal === 0 && status !== "draft" && <p className="text-xs text-foreground-muted">No required reviewers — the first decision settles this round.</p>}
      {round.message && <p className="whitespace-pre-wrap rounded-theme bg-surface px-2.5 py-1.5 text-xs text-foreground">{round.message}</p>}

      <ul className="flex flex-col gap-1.5">
        {(managing ? active : reviewers.filter((r) => !r.removedAt || r.decision || r.commentedAt)).map((r) => (
          <ReviewerRow
            key={r.key}
            r={r}
            detail={detailByKey.get(r.key)}
            manage={managing && canManage}
            busy={busy}
            replacements={addable}
            onToggleRequired={() => run(() => manageReviewRound(workspaceId, round.id, { setRequired: [{ key: r.key, required: !r.required }] }))}
            onRemove={() => run(() => manageReviewRound(workspaceId, round.id, { remove: [r.key] }), "Reviewer removed")}
            onReplace={(uid) => run(() => manageReviewRound(workspaceId, round.id, { replace: [{ from: r.key, to: { uid } }] }), "Reviewer replaced")}
          />
        ))}
      </ul>

      {caps?.isReviewer && caps.canDecide && open && status !== "draft" && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            maxLength={2000}
            className="h-9 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" isLoading={busy} onClick={() => run(() => decideReviewRound(workspaceId, round.id, "approved", note || undefined), "Approved")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> {me?.decision === "approved" ? "Approved" : "Approve"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" isLoading={busy} onClick={() => run(() => decideReviewRound(workspaceId, round.id, "changes_requested", note || undefined), "Changes requested")}>
              <XCircle className="h-3.5 w-3.5" /> Request changes
            </Button>
          </div>
          {me?.decision && <p className="text-xs text-foreground-muted">You can change your decision while this round is open.</p>}
        </div>
      )}
      {caps?.isReviewer && !caps.canDecide && open && status !== "draft" && (
        <p className="text-xs text-foreground-muted">You can view and comment on this review. You don&apos;t have permission to approve or request changes.</p>
      )}

      {managing && canManage && (
        <div className="flex gap-2">
          <select aria-label="Add a project member" value={addUid} onChange={(e) => setAddUid(e.target.value)} className="h-9 min-w-0 flex-1 rounded-theme border border-border bg-surface px-2 text-sm text-foreground">
            <option value="">Add a project member…</option>
            {addable.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}{m.canDecide ? "" : " (view only)"}</option>)}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!addUid}
            isLoading={busy}
            onClick={() => run(async () => { const m = eligible.find((x) => x.uid === addUid); await manageReviewRound(workspaceId, round.id, { addInternal: [{ uid: addUid, required: !!m?.canDecide }] }); setAddUid(""); }, "Reviewer added")}
          >
            <UserPlus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}

      {showNextRoundPrompt && (
        <div className="flex flex-col gap-2 rounded-theme border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-xs text-foreground">v{asset.versionNumber} is new. Start Round {(latest!.roundNumber ?? 0) + 1}? Earlier approvals don&apos;t carry over, and nobody is notified until you press Send.</p>
          <Button size="sm" onClick={() => onStartRound(latest)}>Start Review Round {(latest!.roundNumber ?? 0) + 1}</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setManaging((m) => !m)}>
            <Settings2 className="h-3.5 w-3.5" /> {managing ? "Done" : "Manage review"}
          </Button>
        )}
        {!open && !showNextRoundPrompt && round === latest && asset.id === round.fileId && status !== "draft" && (
          <Button size="sm" variant="outline" onClick={() => onStartRound(round)}>Start next round</Button>
        )}
        {rounds.length > 1 && (
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((h) => !h)}>
            <History className="h-3.5 w-3.5" /> History ({rounds.length})
          </Button>
        )}
      </div>

      {showHistory && (
        <ul className="flex flex-col gap-1" aria-label="Review history">
          {rounds.map((r) => {
            const s = aggregateRound(Object.values(r.reviewers ?? {}));
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelectRound(r)}
                  className={cn("flex w-full flex-col gap-1 rounded-theme border px-2.5 py-1.5 text-left text-xs hover:bg-surface", r.id === round.id ? "border-primary/50 bg-surface" : "border-border")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">Round {r.roundNumber} · v{r.version}</span>
                    <ReviewStatusBadge status={normalizeRoundStatus(r.status)} />
                  </span>
                  <span className="text-foreground-muted">
                    {progressLabel(s)} · {formatDate(r.requestedAt ?? r.createdAt)}{r.completedAt ? ` → ${formatDate(r.completedAt)}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
